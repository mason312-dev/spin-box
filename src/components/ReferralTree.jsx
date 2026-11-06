import { useRef, useState } from 'react';
import { ArrowRightIcon, CopyIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import '@styles/components/PlayerBenefits.css';

const rates = [10, 5, 4, 3, 2];

export default function ReferralTree({ userId, referralBalance, totalTeam, teamState, onRefreshTeam, onConvertCredits, onOpenWallet }) {
  const { formatMoney } = useCurrency();
  const [shareStatus, setShareStatus] = useState('');
  const [conversion, setConversion] = useState('idle');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const linkField = useRef(null);
  const referralUrl = `https://temuspinbox.com/?ref=${encodeURIComponent(userId)}`;
  const hasEarnings = Number(referralBalance) > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setShareStatus('Invite link copied.');
    } catch {
      linkField.current?.focus();
      linkField.current?.select();
      setShareStatus('Copy the selected link to share it.');
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'TemuSpinBox', url: referralUrl });
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('Sharing is unavailable. Use Copy link instead.');
    }
  }

  async function convert() {
    if (!hasEarnings || lock.current || conversion !== 'review') return;
    lock.current = true;
    setConversion('pending');
    setNotice('');
    try {
      const result = await onConvertCredits();
      if (result.error) {
        setConversion('idle');
        setNotice(result.error);
        return;
      }
      setNotice(`${formatMoney(result.amount)} moved to your wallet.`);
      setConversion('idle');
    } catch {
      setConversion('uncertain');
      setNotice('We couldn’t confirm the transfer. Check your balances before trying again.');
    } finally {
      lock.current = false;
    }
  }

  return (
    <section className="benefit-panel" aria-labelledby="referrals-title">
      <header><p className="benefit-kicker"><UsersThreeIcon size={16} /> Invite your network</p><h2 id="referrals-title">Referrals</h2>
        <p>Share your link. Eligible deposits across your referral network can earn you commission.</p></header>

      <div className="benefit-block benefit-invite">
        <label htmlFor="referral-invite">Your invite link</label>
        <input id="referral-invite" ref={linkField} value={referralUrl} readOnly onFocus={(event) => event.target.select()} />
        <div className="benefit-actions">
          <button type="button" className="benefit-primary" onClick={copy}><CopyIcon size={17} /> Copy link</button>
          {typeof navigator.share === 'function' && <button type="button" className="benefit-secondary" onClick={share}>Share</button>}
        </div>
        {shareStatus && <p role="status">{shareStatus}</p>}
      </div>

      <div className="benefit-block">
        <dl className="benefit-stats">
          <div><dt>Available commission</dt><dd>{formatMoney(referralBalance)}</dd></div>
          <div><dt>Depositors who earned you commission</dt><dd>{teamState === 'ready' ? totalTeam : '—'}</dd></div>
        </dl>
        {teamState === 'loading' && <p role="status">Loading depositor count…</p>}
        {teamState === 'error' && <div className="benefit-row"><p role="alert">Depositor count unavailable.</p><button className="benefit-secondary" type="button" onClick={onRefreshTeam}>Retry</button></div>}
        {hasEarnings && conversion === 'idle' && <div className="benefit-actions">
          <button className="benefit-primary" type="button" onClick={() => { setNotice(''); setConversion('review'); }}>Move to wallet <ArrowRightIcon size={17} /></button>
          <button className="benefit-secondary" type="button" onClick={onOpenWallet}>Open wallet</button>
        </div>}
        {conversion === 'review' && <div className="benefit-inset">
          <p>Move your full available commission of {formatMoney(referralBalance)} to your TemuSpinBox wallet?</p>
          <div className="benefit-actions">
            <button className="benefit-primary" type="button" onClick={convert}>Confirm transfer</button>
            <button className="benefit-secondary" type="button" onClick={() => setConversion('idle')}>Cancel</button>
          </div>
        </div>}
        {conversion === 'pending' && <p role="status">Moving earnings…</p>}
        {!hasEarnings && conversion === 'idle' && <p>Available earnings will appear after a qualifying deposit generates commission.</p>}
        {notice && <p className="benefit-feedback" role={conversion === 'uncertain' ? 'alert' : 'status'}>{notice}</p>}
      </div>

      <details className="benefit-block benefit-levels">
        <summary>How the five levels work</summary>
        <p>Level 1 is someone you invite directly. Level 2 is someone they invite, and so on.</p>
        <ol>{rates.map((rate, index) => <li key={rate}><span>Level {index + 1}{index === 0 ? ' · Direct' : ''}</span><strong>{rate}%</strong></li>)}</ol>
      </details>
    </section>
  );
}
