import { useState, useEffect } from 'react';
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

const CURRENT_SPIN_COST_USD = 1;
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
  const { formatMoney } = useCurrency();
  const balance = Number(profile.account_credits);
  const target = selectedProduct ?? starterItem;
  const itemLocked = selectedProduct?.validation?.isEligibleToSpin === false
    && balance <= selectedProduct.checkedBalance;
  const needsDeposit = balance < CURRENT_SPIN_COST_USD || itemLocked;
  const amountCharged = formatMoney(CURRENT_SPIN_COST_USD);
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

  async function handleRequestServerSpin() {
    setSpinStatus(null);
    try {
      const { data, error } = await supabase.rpc('execute_paid_spin', {
        p_product_title: target.title,
        p_retail_value_usd: target.priceUsd,
      });
      if (!error && data) return data;
      if (error?.message?.includes('Insufficient spin credits')) {
        setSpinStatus({ title: 'Wallet balance too low', text: 'Add funds before starting a round.' });
        return null;
      }
      if (error?.message?.includes('exceeds your current tier cap')) {
        setSpinStatus({ title: 'Item exceeds your current limit', text: 'Check the item again or add funds before spinning.' });
        return null;
      }
    } catch {
      // A transport failure can arrive after the server records the round.
    }
    setRoundUncertain(true);
    setSpinStatus({
      title: 'Round result unavailable',
      text: 'Check your wallet and orders before starting another round.',
    });
    return null;
  }

  function handleDashboardSpinComplete(result) {
    if (result.account_credits != null && Number.isFinite(Number(result.account_credits))) {
      onBalanceChange(result.account_credits);
    }
    const charge = Number(result.spin_record?.spin_cost_credits ?? CURRENT_SPIN_COST_USD);
    if (result.outcome === 'TRY_AGAIN') {
      setSpinStatus({ title: 'Try again', text: 'No charge for this spin. You can choose to spin again.' });
      return;
    }
    if (result.outcome === 'LOSE') {
      setSpinStatus({ title: 'You didn’t win', charge });
      return;
    }
    if (result.outcome === 'WIN' && result.spin_record) {
      const wonRecord = {
        ...result.spin_record,
        image_url: target.imageUrl || '',
        currency: target.currency || 'USD',
        display_price: target.displayPrice || formatMoney(result.spin_record.retail_value_usd),
      };
      setWins((previous) => [wonRecord, ...previous]);
      setActiveWinModal(wonRecord);
      setSpinStatus({ title: 'You won the item', charge, text: 'See your claim options in Orders.' });
      return;
    }
    setRoundUncertain(true);
    setSpinStatus({ title: 'Round result unavailable', text: 'Check your wallet and orders before starting another round.' });
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
              disabled={roundBusy}
              onLoadingChange={setCheckingItem}
              onSelectProduct={(product) => setSelectedProduct({ ...product, checkedBalance: balance })}
            />
            <div className="play-product">
              <div className="play-product-image">
                {target.imageUrl && <img key={target.imageUrl} src={target.imageUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
                <PackageIcon size={42} weight="light" />
              </div>
              <div>
                <p className="play-kicker">{selectedProduct ? 'Selected item' : 'Starter item'}</p>
                <h3>{target.title}</h3>
                <p className="play-product-price">{formatMoney(Number(target.priceUsd))}</p>
                {selectedProduct && (
                  <button type="button" className="play-link" disabled={roundBusy || checkingItem} onClick={() => setSelectedProduct(null)}>
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
                  <div><dt>Spin cost</dt><dd>{amountCharged}</dd></div>
                </dl>
                <p>Win or Lose deducts the spin cost. Try Again deducts nothing.</p>
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
              buttonText={roundUncertain ? 'Round unavailable' : checkingItem ? 'Checking item…' : `Spin for ${amountCharged}`}
              disabled={Boolean(needsDeposit || checkingItem || roundUncertain)}
            />
            {needsDeposit && !roundUncertain && (
              <button type="button" className="play-secondary play-add" onClick={onOpenDeposit}>Add funds</button>
            )}
            <div className="play-result" role="status" aria-atomic="true">
              {spinStatus && (
                <>
                  <strong>{spinStatus.title}</strong>
                  {spinStatus.charge !== undefined && <p>{formatMoney(spinStatus.charge)} deducted from your wallet.</p>}
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