import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeftIcon, ArrowUpRightIcon, CopyIcon, WalletIcon, XIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import { supabase } from '@services/supabaseClient';
import '@styles/components/CryptoWalletModal.css';

const assets = [
  { id: 'USDT_TRX', asset: 'USDT', chain: 'TRX', network: 'Tron · TRC-20' },
  { id: 'USDC_SOL', asset: 'USDC', chain: 'SOL', network: 'Solana' },
  { id: 'SOL_SOL', asset: 'SOL', chain: 'SOL', network: 'Solana' },
  { id: 'TRX_TRX', asset: 'TRX', chain: 'TRX', network: 'Tron' },
  { id: 'USDT_ETH', asset: 'USDT', chain: 'ETH', network: 'Ethereum · ERC-20' },
  { id: 'BTC_BTC', asset: 'BTC', chain: 'BTC', network: 'Bitcoin' },
];
const minDepositUsd = 2;
const minWithdrawalUsd = 5;

export default function CryptoWalletModal({ isOpen, user, ...props }) {
  const [uncertainUser, setUncertainUser] = useState(null);
  if (!isOpen || !user?.id) return null;
  return (
    <WalletDialog
      key={user.id}
      {...props}
      userId={user.id}
      uncertain={uncertainUser === user.id}
      onUncertain={() => setUncertainUser(user.id)}
    />
  );
}

function WalletDialog({ userId, profile, onClose, onBalancesUpdated, uncertain, onUncertain }) {
  const [mode, setMode] = useState('deposit');
  const [asset, setAsset] = useState(assets[0]);
  const [source, setSource] = useState('ACCOUNT_CREDITS');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const pending = useRef(false);
  const { formatMoney } = useCurrency();
  const balance = Number(source === 'ACCOUNT_CREDITS' ? profile.account_credits : profile.referral_balance);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function close() {
    if (!pending.current) onClose();
  }

  async function withdraw(event) {
    event.preventDefault();
    if (pending.current || uncertain) return;
    const amountUsd = Number(amount);
    const address = destination.trim();
    if (!Number.isFinite(amountUsd) || amountUsd < minWithdrawalUsd || amountUsd > balance || address.length < 20) {
      setFeedback({ error: 'Check the destination address, minimum withdrawal and available balance.' });
      return;
    }

    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const { data, error, status } = await supabase.rpc('request_crypto_withdrawal', {
        p_source_ledger: source,
        p_chain: asset.chain,
        p_asset: asset.asset,
        p_destination_address: address,
        p_amount_usd: amountUsd,
      });
      if (error && status >= 400 && status < 500 && status !== 408) {
        setFeedback({ error: error.code === 'P0001' ? error.message : 'The request was declined. Check your details and try again.' });
        return;
      }
      if (error || !data?.withdrawal_id) {
        onUncertain();
        return;
      }
      onBalancesUpdated?.(data);
      setFeedback({ amount: data.amount_usd, id: data.withdrawal_id, asset });
      setAmount('');
      setDestination('');
    } catch {
      onUncertain();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="tsb-wallet" aria-labelledby="wallet-title"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <header className="wallet-heading">
        <div>
          <p><WalletIcon size={17} /> TemuSpinBox / Funds</p>
          <h2 id="wallet-title">Your wallet</h2>
        </div>
        <button type="button" className="wallet-control wallet-close" aria-label="Close wallet" onClick={close} disabled={busy}><XIcon size={20} /></button>
      </header>
      <div className="wallet-body">
        <aside className="wallet-sidebar">
          <dl className="wallet-balances">
            <div><dt>Wallet balance</dt><dd>{formatMoney(profile.account_credits)}</dd></div>
            <div><dt>Referral earnings</dt><dd>{formatMoney(profile.referral_balance)}</dd></div>
          </dl>
          <div className="wallet-modes" role="group" aria-label="Wallet actions">
            <button type="button" className="wallet-control" aria-pressed={mode === 'deposit'} disabled={busy} onClick={() => setMode('deposit')}><ArrowDownLeftIcon size={18} /> Deposit</button>
            <button type="button" className="wallet-control" aria-pressed={mode === 'withdraw'} disabled={busy} onClick={() => setMode('withdraw')}><ArrowUpRightIcon size={18} /> Withdraw</button>
          </div>
        </aside>
        <section className="wallet-task" aria-labelledby="wallet-task-title">
          <h3 id="wallet-task-title">{mode === 'deposit' ? 'Add funds' : 'Request a withdrawal'}</h3>
          <label htmlFor="wallet-asset">Asset and network</label>
          <select id="wallet-asset" value={asset.id} disabled={busy} onChange={(event) => {
            setAsset(assets.find((item) => item.id === event.target.value));
            setDestination('');
          }}>
            {assets.map((item) => <option key={item.id} value={item.id}>{item.asset} / {item.network}</option>)}
          </select>

          {mode === 'deposit' ? (
            <DepositAddress key={asset.id} userId={userId} asset={asset} />
          ) : (
            <>
              <form className="wallet-form" onSubmit={withdraw}>
                <fieldset disabled={busy || uncertain}>
                  <label htmlFor="wallet-source">Withdraw from</label>
                  <select id="wallet-source" value={source} onChange={(event) => setSource(event.target.value)}>
                    <option value="ACCOUNT_CREDITS">Wallet balance</option>
                    <option value="REFERRAL_BALANCE">Referral earnings</option>
                  </select>
                  <label htmlFor="wallet-destination">{asset.asset} destination address</label>
                  <input id="wallet-destination" type="text" value={destination} required minLength={20} autoComplete="off" spellCheck={false}
                    onChange={(event) => setDestination(event.target.value)} aria-describedby="wallet-network-note" />
                  <p id="wallet-network-note" className="wallet-note">The receiving wallet must support {asset.asset} on {asset.network}.</p>
                  <label htmlFor="wallet-amount">Amount in USD</label>
                  <input id="wallet-amount" type="number" min={minWithdrawalUsd} step="0.01" required inputMode="decimal"
                    value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="wallet-amount-note" />
                  <p id="wallet-amount-note" className="wallet-note">
                    Minimum {formatMoney(minWithdrawalUsd)}. Available {formatMoney(balance)}.
                    {Number(amount) > 0 && <><br />Entered amount: {formatMoney(Number(amount))}.</>}
                  </p>
                  <button type="submit" className="wallet-primary">{busy ? 'Submitting…' : 'Request withdrawal'}<ArrowUpRightIcon size={18} /></button>
                </fieldset>
              </form>
              {uncertain && <p className="wallet-feedback wallet-error" role="alert">We couldn’t confirm the withdrawal request. Check your balance and contact support before trying again.</p>}
              {feedback?.error && <p className="wallet-feedback wallet-error" role="alert">{feedback.error}</p>}
              {feedback?.id && (
                <div className="wallet-feedback" role="status">
                  <strong>Withdrawal pending</strong>
                  <p>{formatMoney(feedback.amount)} via {feedback.asset.asset} on {feedback.asset.network}.</p>
                  <p>Request reference: <code>{feedback.id}</code></p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </dialog>
  );
}

function DepositAddress({ userId, asset }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const { formatMoney } = useCurrency();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data: existing, error } = await supabase.from('deposit_addresses')
          .select('public_address').eq('user_id', userId).eq('chain', asset.chain)
          .abortSignal(controller.signal).maybeSingle();
        if (controller.signal.aborted) return;
        if (!error && existing?.public_address) {
          setResult({ address: existing.public_address });
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;
        if (!session?.access_token) {
          setResult({ error: 'Your session expired. Sign in again to get a deposit address.' });
          return;
        }
        const api = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${api}/api/wallet/deposit-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ chain: asset.chain, asset: asset.asset }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !payload.success || !payload.data?.address) throw new Error('Address unavailable');
        setResult({ address: payload.data.address });
      } catch {
        if (!controller.signal.aborted) setResult({ error: 'We couldn’t load this deposit address. Try again.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [userId, asset, attempt]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(result.address);
      setCopyStatus('Address copied.');
    } catch {
      setCopyStatus('Copy failed. Select the address and copy it manually.');
    }
  }

  return (
    <div className="wallet-deposit">
      <p className="wallet-note">Send only {asset.asset} on {asset.network} to this address. Minimum deposit {formatMoney(minDepositUsd)}.</p>
      {!result && <p className="wallet-feedback" role="status">Loading deposit address…</p>}
      {result?.error && (
        <div className="wallet-feedback wallet-error">
          <p role="alert">{result.error}</p>
          <button type="button" className="wallet-control" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}>Try again</button>
        </div>
      )}
      {result?.address && (
        <div className="wallet-address">
          <strong>Deposit address</strong>
          <code>{result.address}</code>
          <button type="button" className="wallet-control" onClick={copyAddress}><CopyIcon size={18} /> Copy address</button>
          <p role="status">{copyStatus}</p>
        </div>
      )}
    </div>
  );
}
