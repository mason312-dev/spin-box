import { useState, useEffect, useRef } from 'react';
import { PackageIcon, TicketIcon, WalletIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import { supabase } from '@services/supabaseClient';
import SpinWheel from '@components/SpinWheel';
import TemuInspector from '@components/TemuInspector';
import OrderTracker from '@components/OrderTracker';
import UgcProofCard from '@components/UgcProofCard';
import ReferralTree from '@components/ReferralTree';
import FulfillmentModal from '@components/FulfillmentModal';
import '@styles/pages/Dashboard.css';

const MIN_STAKE_USD = 1;
const starterItem = { title: 'Welcome Starter Item', priceUsd: 2 };

export default function Dashboard({
  user,
  profile,
  onBalanceChange,
  onReferralChange,
  onOpenDeposit
}) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [spinStatus, setSpinStatus] = useState(null);
  const [activityMessage, setActivityMessage] = useState('');
  const [roundBusy, setRoundBusy] = useState(false);
  const [checkingItem, setCheckingItem] = useState(false);
  const [roundUncertain, setRoundUncertain] = useState(false);
  const [retryRound, setRetryRound] = useState(null);
  const [roundState, setRoundState] = useState('loading');
  const [stakeInput, setStakeInput] = useState('');
  const requestId = useRef(null);
  const { formatMoney } = useCurrency();
  const balance = Number(profile.account_credits);
  const target = retryRound ? {
    title: retryRound.product_title,
    priceUsd: retryRound.retail_value_usd,
    imageUrl: retryRound.image_url,
  } : selectedProduct ?? starterItem;
  const stake = retryRound ? Number(retryRound.stake_usd) : selectedProduct ? Number(stakeInput) : MIN_STAKE_USD;
  const validStake = retryRound || !selectedProduct || (
    /^\d+(?:\.\d{1,2})?$/.test(stakeInput) && stake >= MIN_STAKE_USD && stake <= 99999999.99
  );
  const multiplier = stake >= 101 ? 7 : stake >= 5 ? 5 : 2;
  const itemLocked = !retryRound && validStake && Math.round(stake * 100) * multiplier < Math.round(Number(target.priceUsd) * 100);
  const needsDeposit = !retryRound && validStake && stake > balance;
  const amountCharged = validStake ? formatMoney(stake) : 'Enter stake';
  const roundBlocked = roundState !== 'ready' || (!roundUncertain && (!validStake || needsDeposit || itemLocked));
  const pickLocked = roundBusy || roundUncertain || Boolean(retryRound) || roundState !== 'ready';
  const [wins, setWins] = useState([]);
  const [activeWinModal, setActiveWinModal] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [totalTeam, setTotalTeam] = useState(null);
  const [winsState, setWinsState] = useState('loading');
  const [teamState, setTeamState] = useState('loading');

  function refreshBenefits() {
    setWinsState('loading');
    setTeamState('loading');
    setRefreshTick((tick) => tick + 1);
  }

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let ignore = false;

    async function loadDashboardData() {
      const [spinsRes, teamRes] = await Promise.all([
        supabase
          .from('game_spins')
          .select('*')
          .eq('user_id', userId)
          .eq('outcome', 'WIN')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.rpc('get_referral_network_stats')
      ]);

      if (!ignore) {
        if (spinsRes.data) setWins(spinsRes.data);
        setWinsState(spinsRes.error ? 'error' : 'ready');
        setTeamState(teamRes.data?.total_team != null ? 'ready' : 'error');
        if (teamRes.data?.total_team !== undefined) {
          setTotalTeam(Number(teamRes.data.total_team));
        }
      }
    }

    loadDashboardData().catch(() => {
      if (!ignore) {
        setWinsState('error');
        setTeamState('error');
      }
    });
    return () => {
      ignore = true;
    };
  }, [userId, refreshTick]);

  useEffect(() => {
    if (!userId) return undefined;
    let ignore = false;
    async function loadRound() {
      try {
        const { data, error } = await supabase.from('paid_rounds').select('*')
          .eq('user_id', userId).eq('status', 'RETRY').maybeSingle();
        if (ignore) return;
        if (error) throw error;
        setRetryRound(data);
        setRoundState('ready');
      } catch {
        if (!ignore) setRoundState('error');
      }
    }
    void loadRound();
    return () => { ignore = true; };
  }, [userId]);

  async function handleRequestServerSpin() {
    setSpinStatus(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const { data, error, status } = await supabase.rpc('play_paid_round', {
        p_request_id: requestId.current,
        p_round_id: retryRound?.id ?? null,
        p_product_id: selectedProduct?.id ?? null,
        p_expected_price_usd: Number(target.priceUsd),
        p_stake_usd: stake,
      });
      if (!error && data?.round && data?.spin_record) return data;
      if (status === 400 && error?.code === 'P0001') {
        requestId.current = null;
        setRoundUncertain(false);
        if (error.message.startsWith('Round changed.')) setRoundState('error');
        setSpinStatus({ title: 'Round unavailable', text: error.message });
        return null;
      }
    } catch {
      // Reusing the request ID recovers a response lost after the database committed.
    }
    setRoundUncertain(true);
    setSpinStatus({
      title: 'Round result unavailable',
      text: 'Check the result again to recover this request without a second charge.',
    });
    return null;
  }

  function handleDashboardSpinComplete(result) {
    requestId.current = null;
    setRoundUncertain(false);
    if (result.account_credits != null && Number.isFinite(Number(result.account_credits))) {
      onBalanceChange(result.account_credits);
    }
    setRetryRound(result.round.status === 'RETRY' ? result.round : null);
    const charge = Number(result.round.stake_usd);
    if (result.outcome === 'TRY_AGAIN') {
      setSpinStatus({ title: 'Try again', text: 'Your stake is held for this item. Spin again at no extra cost.' });
      return;
    }
    if (result.outcome === 'LOSE') {
      setSpinStatus({ title: 'You didn’t win', text: `You lost your ${formatMoney(charge)} stake.` });
      return;
    }
    const wonRecord = { ...result.spin_record, image_url: result.round.image_url };
    setWins((previous) => [wonRecord, ...previous.filter((win) => win.id !== wonRecord.id)]);
    setActiveWinModal(wonRecord);
    setSpinStatus({ title: 'You won the item', text: 'See your claim options in Orders.' });
  }

  function handleFulfillmentComplete(result) {
    setActiveWinModal(null);
    setWins((previous) => previous.map((win) => {
      if (win.id !== result.spinId) return win;
      return result.type === 'LIQUIDATED'
        ? { ...win, fulfillment_choice: 'LIQUIDATED', liquidation_cash_usd: result.payoutUsd, shipping_status: 'NOT_APPLICABLE' }
        : { ...win, fulfillment_choice: 'SHIPPED', shipping_status: 'PENDING', product_attributes: result.attributes };
    }));
    setRefreshTick((tick) => tick + 1);
    if (result.type === 'LIQUIDATED' && result.newBalance !== undefined) {
      onBalanceChange(result.newBalance);
      setActivityMessage(`${formatMoney(result.payoutUsd)} added to your wallet.`);
    } else if (result.type === 'SHIPPED') {
      setActivityMessage('Delivery details saved. Check your order below.');
    }
  }

  async function handleConvertReferralCredits() {
    const { data, error, status } = await supabase.rpc('convert_referral_to_credits');
    if (error && status >= 400 && status < 500 && status !== 408) {
      return { error: 'The transfer was declined. Check your available commission and try again.' };
    }
    if (error || data?.account_credits == null || data?.converted_usd == null) {
      throw new Error('Transfer not confirmed');
    }
    onBalanceChange(data.account_credits);
    onReferralChange?.(0);
    return { amount: Number(data.converted_usd) };
  }

  return (
    <main className="tsb-play-page" id="main-content">
      <div className="tsb-play-wrap">
        <header className="play-heading">
          <div>
            <p className="play-kicker">TemuSpinBox / Play</p>
            <h1>Pick your item.</h1>
            <p>Check the price and review the round before you spin.</p>
          </div>
          <button type="button" className="play-secondary" onClick={onOpenDeposit}>
            <WalletIcon size={18} /> Wallet <strong>{formatMoney(balance)}</strong>
          </button>
        </header>

        <div className="play-board">
          <section className="play-pick" aria-labelledby="play-pick-heading">
            <p className="play-kicker">01 / The item</p>
            <h2 id="play-pick-heading">What are you playing for?</h2>
            <TemuInspector
              userDepositBalance={balance}
              disabled={pickLocked}
              onLoadingChange={setCheckingItem}
              onSelectProduct={(product) => {
                setSelectedProduct(product);
                setStakeInput('');
                setSpinStatus(null);
              }}
            />
            <div className="play-product">
              <div className="play-product-image">
                {target.imageUrl && <img key={target.imageUrl} src={target.imageUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
                <PackageIcon size={42} weight="light" />
              </div>
              <div>
                <p className="play-kicker">{retryRound ? 'Reserved for this round' : selectedProduct ? 'Selected item' : 'Starter item'}</p>
                <h3>{target.title}</h3>
                <p className="play-product-price">{formatMoney(Number(target.priceUsd))}</p>
                {selectedProduct && !retryRound && (
                  <button type="button" className="play-link" disabled={pickLocked || checkingItem} onClick={() => setSelectedProduct(null)}>
                    Use starter item
                  </button>
                )}
              </div>
            </div>
            <div className="play-ticket">
              <TicketIcon size={22} weight="regular" />
              <div>
                <h3>Round review</h3>
                <dl>
                  <div><dt>Item value</dt><dd>{formatMoney(Number(target.priceUsd))}</dd></div>
                  <div><dt>{retryRound ? 'Reserved stake' : 'Stake'}</dt><dd>{amountCharged}</dd></div>
                </dl>
                {selectedProduct && !retryRound && (
                  <div className="play-stake">
                    <label htmlFor="play-stake">Enter stake in USD</label>
                    <input id="play-stake" type="text" inputMode="decimal" placeholder="1.00"
                      disabled={pickLocked || checkingItem} value={stakeInput}
                      onChange={(event) => setStakeInput(event.target.value)} />
                  </div>
                )}
                <p>{retryRound
                  ? 'Your next spin uses the stake already held for this item.'
                  : 'Win or lose, the stake is spent. If you land on Try again, you can spin for this item at no extra cost.'}</p>
                {itemLocked && <p className="play-ticket-note">Enter a higher stake to play for this item.</p>}
                {needsDeposit && <p className="play-ticket-note">Add funds to play for this item.</p>}
              </div>
            </div>
          </section>

          <section className="play-stage" aria-labelledby="play-stage-heading">
            <p className="play-kicker">02 / The round</p>
            <h2 id="play-stage-heading">Spin the wheel</h2>
            <SpinWheel
              onRequestServerSpin={handleRequestServerSpin}
              onSpinResult={handleDashboardSpinComplete}
              onBusyChange={setRoundBusy}
              buttonText={roundUncertain ? 'Check round result' : retryRound ? 'Spin again' : checkingItem ? 'Checking item…' : validStake ? `Stake ${amountCharged} and spin` : 'Enter a stake to spin'}
              disabled={Boolean(roundBlocked || checkingItem)}
            />
            {needsDeposit && !roundUncertain && (
              <button type="button" className="play-secondary play-add" onClick={onOpenDeposit}>Add funds</button>
            )}
            {roundState === 'loading' && <p role="status">Checking for an open round…</p>}
            {roundState === 'error' && (
              <button type="button" className="play-secondary play-add" onClick={() => window.location.reload()}>Reload to check your round</button>
            )}
            <div className="play-result" role="status" aria-atomic="true">
              {spinStatus && (
                <>
                  <strong>{spinStatus.title}</strong>
                  {spinStatus.text && <p>{spinStatus.text}</p>}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="play-account">
          {activityMessage && <div className="status-banner" role="status">{activityMessage}</div>}
          <div className="play-orders">
            <OrderTracker wins={wins} onClaimUnclaimed={setActiveWinModal} />
          </div>

          <UgcProofCard key={`rewards-${userId}`} userId={userId} wins={wins} winsState={winsState} onRefreshWins={refreshBenefits} />

          <ReferralTree
            key={`referrals-${userId}`}
            userId={userId}
            referralBalance={profile.referral_balance}
            totalTeam={totalTeam}
            teamState={teamState}
            onRefreshTeam={refreshBenefits}
            onOpenWallet={onOpenDeposit}
            onConvertCredits={handleConvertReferralCredits}
          />

        </div>
      </div>

      <FulfillmentModal
        winRecord={activeWinModal}
        onClose={(refreshOrders) => {
          setActiveWinModal(null);
          if (refreshOrders) setRefreshTick((tick) => tick + 1);
        }}
        onFulfillmentSuccess={handleFulfillmentComplete}
      />
    </main>
  );
}