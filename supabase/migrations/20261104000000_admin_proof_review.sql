ALTER TABLE public.ugc_proof_submissions ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE OR REPLACE FUNCTION public.review_ugc_proof(
  p_admin_id uuid, p_submission_id uuid, p_status text, p_reason text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submission public.ugc_proof_submissions%ROWTYPE;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_admin_id AND is_admin IS TRUE) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid review decision.';
  END IF;
  IF p_status = 'REJECTED' AND (coalesce(length(trim(p_reason)), 0) = 0 OR length(p_reason) > 500) THEN
    RAISE EXCEPTION 'Enter a rejection reason of up to 500 characters.';
  END IF;

  SELECT * INTO v_submission
  FROM public.ugc_proof_submissions
  WHERE id = p_submission_id
  FOR UPDATE;
  IF NOT FOUND OR v_submission.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'The proof is no longer pending.' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'APPROVED' THEN
    v_result := public.process_confirmed_deposit(
      v_submission.user_id, 'ugc_reward_' || v_submission.id,
      'SYSTEM', 'CREDITS', v_submission.reward_credits_awarded, v_submission.reward_credits_awarded
    );
    IF coalesce(v_result->>'credited', '') <> 'true' AND coalesce(v_result->>'reason', '') <> 'ALREADY_CREDITED' THEN
      RAISE EXCEPTION 'The reward could not be credited.';
    END IF;
  END IF;

  UPDATE public.ugc_proof_submissions
  SET status = p_status, rejection_reason = CASE WHEN p_status = 'REJECTED' THEN trim(p_reason) END
  WHERE id = p_submission_id;

  INSERT INTO public.admin_audit_logs(admin_id, action_type, target_id, metadata)
  VALUES (p_admin_id, 'UGC_' || p_status, p_submission_id, jsonb_build_object('reward', v_submission.reward_credits_awarded));
END;
$$;

REVOKE ALL ON FUNCTION public.review_ugc_proof(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_ugc_proof(uuid, uuid, text, text) TO service_role;
-- The deposit function accepts a target user and amount and is called by trusted server code.
REVOKE EXECUTE ON FUNCTION public.process_confirmed_deposit(uuid, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_confirmed_deposit(uuid, text, text, text, numeric, numeric) TO service_role;
