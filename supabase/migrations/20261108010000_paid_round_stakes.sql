BEGIN;

CREATE TABLE public.paid_rounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.temu_products(id) ON DELETE SET NULL,
    product_title text NOT NULL,
    retail_value_usd numeric(10, 2) NOT NULL,
    image_url text,
    stake_usd numeric(10, 2) NOT NULL CHECK (stake_usd >= 1),
    status text NOT NULL CHECK (status IN ('RETRY', 'WIN', 'LOSE')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX paid_rounds_one_retry_per_user
    ON public.paid_rounds (user_id) WHERE status = 'RETRY';

ALTER TABLE public.paid_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paid_rounds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.paid_rounds TO authenticated;
CREATE POLICY read_own_paid_round ON public.paid_rounds
    FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.game_spins
    ADD COLUMN paid_round_id uuid REFERENCES public.paid_rounds(id) ON DELETE SET NULL,
    ADD COLUMN paid_request_id uuid,
    ADD COLUMN wallet_debit_usd numeric(10, 2);

CREATE UNIQUE INDEX game_spins_paid_request
    ON public.game_spins (user_id, paid_request_id) WHERE paid_request_id IS NOT NULL;

CREATE FUNCTION public.play_paid_round(
    p_request_id uuid,
    p_round_id uuid,
    p_product_id uuid,
    p_expected_price_usd numeric,
    p_stake_usd numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_balance numeric;
    v_product public.temu_products;
    v_round public.paid_rounds;
    v_spin public.game_spins;
    v_title text := 'Welcome Starter Item';
    v_price numeric := 2;
    v_image text;
    v_max_price numeric;
    v_debit numeric := 0;
    v_roll double precision;
    v_outcome text;
BEGIN
    IF v_user_id IS NULL OR p_request_id IS NULL THEN
        RAISE EXCEPTION 'Sign in to play.';
    END IF;

    -- Share the wallet row lock used by withdrawal and other balance mutations.
    SELECT account_credits INTO v_balance FROM public.users WHERE id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet unavailable.';
    END IF;

    SELECT * INTO v_spin FROM public.game_spins
    WHERE user_id = v_user_id AND paid_request_id = p_request_id;

    IF NOT FOUND THEN
        SELECT * INTO v_round FROM public.paid_rounds
        WHERE user_id = v_user_id AND status = 'RETRY';

        IF p_round_id IS DISTINCT FROM v_round.id THEN
            RAISE EXCEPTION 'Round changed. Reload to continue.';
        END IF;

        IF v_round.id IS NULL THEN
            IF p_stake_usd IS NULL OR p_stake_usd NOT BETWEEN 1 AND 99999999.99
                OR p_stake_usd <> round(p_stake_usd, 2) THEN
                RAISE EXCEPTION 'Enter a stake of at least $1.00 USD, with up to two decimal places.';
            END IF;

            IF p_product_id IS NOT NULL THEN
                SELECT * INTO v_product FROM public.temu_products WHERE id = p_product_id FOR SHARE;
                IF NOT FOUND OR v_product.in_stock IS NOT TRUE OR v_product.price_usd NOT BETWEEN 0.01 AND 99999999.99
                    OR v_product.updated_at IS NULL OR v_product.updated_at <= now() - interval '6 hours'
                    OR v_product.price_usd IS DISTINCT FROM p_expected_price_usd THEN
                    RAISE EXCEPTION 'Item price or availability changed. Check the item again.';
                END IF;
                v_title := v_product.title;
                v_price := v_product.price_usd;
                v_image := v_product.image_url;
            ELSIF p_expected_price_usd IS DISTINCT FROM v_price OR p_stake_usd <> 1 THEN
                RAISE EXCEPTION 'The starter item uses a $1.00 USD stake.';
            END IF;

            v_max_price := p_stake_usd * CASE WHEN p_stake_usd >= 101 THEN 7 WHEN p_stake_usd >= 5 THEN 5 ELSE 2 END;
            IF v_price > v_max_price THEN
                RAISE EXCEPTION 'The stake is too low for this item.';
            END IF;
            IF v_balance < p_stake_usd THEN
                RAISE EXCEPTION 'Your wallet balance is too low for this stake.';
            END IF;

            v_debit := p_stake_usd;
            UPDATE public.users SET account_credits = account_credits - v_debit, updated_at = now()
                WHERE id = v_user_id RETURNING account_credits INTO v_balance;
            INSERT INTO public.paid_rounds (user_id, product_id, product_title, retail_value_usd, image_url, stake_usd, status)
                VALUES (v_user_id, p_product_id, v_title, v_price, v_image, p_stake_usd, 'RETRY')
                RETURNING * INTO v_round;
        END IF;

        -- Preserve the existing paid-wheel distribution.
        v_roll := random();
        v_outcome := CASE WHEN v_roll < 0.22 THEN 'WIN' WHEN v_roll < 0.50 THEN 'TRY_AGAIN' ELSE 'LOSE' END;

        IF v_outcome <> 'TRY_AGAIN' THEN
            UPDATE public.paid_rounds SET status = v_outcome
                WHERE id = v_round.id RETURNING * INTO v_round;
        END IF;

        INSERT INTO public.game_spins (
            user_id, product_id, spin_cost_credits, outcome, product_title, retail_value_usd,
            paid_round_id, paid_request_id, wallet_debit_usd
        ) VALUES (
            v_user_id, v_round.product_id, CASE WHEN v_outcome = 'TRY_AGAIN' THEN 0 ELSE v_round.stake_usd END,
            v_outcome, v_round.product_title, v_round.retail_value_usd, v_round.id, p_request_id, v_debit
        ) RETURNING * INTO v_spin;
    ELSE
        SELECT * INTO v_round FROM public.paid_rounds WHERE id = v_spin.paid_round_id;
    END IF;

    RETURN jsonb_build_object(
        'outcome', v_spin.outcome,
        'account_credits', v_balance,
        'spin_record', to_jsonb(v_spin),
        'round', to_jsonb(v_round)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.play_paid_round(uuid, uuid, uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.play_paid_round(uuid, uuid, uuid, numeric, numeric) TO authenticated;

-- Prevent older clients from using the fixed-price function with browser-supplied product data.
REVOKE EXECUTE ON FUNCTION public.execute_paid_spin(text, numeric) FROM PUBLIC, anon, authenticated;

COMMIT;
