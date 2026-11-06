import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import { supabase } from '@services/supabaseClient';
import '@styles/components/PlayerBenefits.css';

const platforms = [
  ['TIKTOK', 'TikTok'], ['INSTAGRAM', 'Instagram'], ['X_TWITTER', 'X'],
  ['TELEGRAM', 'Telegram'], ['YOUTUBE', 'YouTube'],
];
const statuses = { PENDING: 'In review', APPROVED: 'Approved', REJECTED: 'Rejected' };

export default function UgcProofCard({ userId, wins, winsState, onRefreshWins }) {
  const { formatMoney } = useCurrency();
  const [history, setHistory] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState('');
  const [platform, setPlatform] = useState('TIKTOK');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.from('ugc_proof_submissions')
          .select('id,spin_id,proof_type,social_platform,status,reward_credits_awarded,created_at,rejection_reason')
          .eq('user_id', userId).order('created_at', { ascending: false }).abortSignal(controller.signal);
        if (!controller.signal.aborted) setHistory(error ? { error: true } : { entries: data ?? [] });
      } catch {
        if (!controller.signal.aborted) setHistory({ error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [userId, attempt]);

  function refresh() {
    setHistory(null);
    setAttempt((value) => value + 1);
  }

  const entries = history?.entries ?? [];
  const submitted = new Set(entries.map((entry) => entry.spin_id));
  const eligible = wins.filter((win) => !submitted.has(win.id) && (
    win.fulfillment_choice === 'LIQUIDATED'
    || (win.fulfillment_choice === 'SHIPPED' && win.shipping_status === 'DELIVERED')
  ));
  const win = eligible.find((item) => item.id === selected);
  const proofType = win?.fulfillment_choice === 'SHIPPED' ? 'VIDEO_UNBOXING' : 'CASH_SCREENSHOT';

  async function submit(event) {
    event.preventDefault();
    if (!win || lock.current || !history?.entries || winsState !== 'ready') return;
    let link;
    try { link = new URL(url.trim()); } catch { /* Show the validation message below. */ }
    if (!link || !['http:', 'https:'].includes(link.protocol) || link.username || link.password) {
      setMessage({ error: true, text: 'Enter a public post link starting with https://.' });
      return;
    }

    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('submit_ugc_proof', {
        p_spin_id: win.id, p_proof_type: proofType, p_social_platform: platform, p_media_url: link.href,
      });
      if (error || !data?.id) throw new Error('Unconfirmed submission');
      setHistory((previous) => ({ entries: [data, ...(previous?.entries ?? [])] }));
      setSelected('');
      setUrl('');
      setMessage({ text: 'Proof submitted. Follow its review below.' });
    } catch {
      setMessage({ error: true, text: 'We couldn’t confirm the submission. Check your review history before trying again.' });
      refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="benefit-panel" aria-labelledby="rewards-title">
      <header><p className="benefit-kicker"><VideoCameraIcon size={16} /> After your win</p><h2 id="rewards-title">Rewards</h2>
        <p>Share an unboxing after delivery or a screenshot of a prize payout in your wallet.</p></header>

      <div className="benefit-block">
        <h3>Submit proof</h3>
        {!history || (!history.error && winsState === 'loading') ? <p role="status">Checking eligible wins…</p>
          : history.error || winsState === 'error' ? <>
            <p role="alert">We couldn’t check which wins are eligible.</p>
            <button className="benefit-secondary" type="button" disabled={busy} onClick={() => { refresh(); onRefreshWins(); }}>Try again</button>
          </> : eligible.length === 0 ? <>
            <p>No eligible wins among your recent orders. Check for an unclaimed prize or a delivery still in progress.</p>
            <a className="benefit-secondary" href="#orders-title">View orders <ArrowRightIcon size={16} /></a>
          </> : (
            <form className="benefit-form" onSubmit={submit}>
              <label>Choose a win
                <select value={selected} onChange={(event) => { setSelected(event.target.value); setUrl(''); setMessage(null); }} disabled={busy} required>
                  <option value="">Select a completed claim</option>
                  {eligible.map((item) => <option key={item.id} value={item.id}>{item.product_title || 'Temu item'} · {item.fulfillment_choice === 'SHIPPED' ? 'Delivered' : 'Paid to wallet'}</option>)}
                </select>
              </label>
              {win && <>
                <p className="benefit-inset">{proofType === 'VIDEO_UNBOXING'
                  ? 'Post a public video showing the item you received.'
                  : 'Post a screenshot of the prize payout. Hide your email, wallet addresses and other personal details.'}</p>
                <label>Platform<select value={platform} disabled={busy} onChange={(event) => setPlatform(event.target.value)}>
                  {platforms.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select></label>
                <label>Public post link<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} readOnly={busy} required placeholder="https://…" /></label>
                <button type="submit" className="benefit-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'} <ArrowRightIcon size={17} /></button>
              </>}
            </form>
          )}
        {message && <p role={message.error ? 'alert' : 'status'} className="benefit-feedback">{message.text}</p>}
      </div>

      <div className="benefit-block">
        <div className="benefit-row"><h3>Review history</h3><button className="benefit-secondary" type="button" disabled={busy || !history} onClick={refresh}>Refresh</button></div>
        {!history && <p role="status">Loading review history…</p>}
        {history?.error && <p role="alert">Review history is unavailable. Use Refresh to try again.</p>}
        {history?.entries && entries.length === 0 && <p>Submitted proof will appear here.</p>}
        {entries.length > 0 && <ul className="benefit-history">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{wins.find((item) => item.id === entry.spin_id)?.product_title
                  || (entry.proof_type === 'VIDEO_UNBOXING' ? 'Unboxing proof' : 'Wallet payout proof')}</strong>
                <p>{platforms.find(([id]) => id === entry.social_platform)?.[1] ?? 'Social post'}</p>
                {entry.status === 'REJECTED' && <p>{entry.rejection_reason || 'No reason was recorded.'} One submission is allowed per win.</p>}
                {entry.status === 'APPROVED' && entry.reward_credits_awarded != null && <p>Recorded reward {formatMoney(entry.reward_credits_awarded)}</p>}
              </div>
              <span className="benefit-tag" data-status={entry.status}>{statuses[entry.status] ?? 'Status unavailable'}</span>
            </li>
          ))}
        </ul>}
      </div>
    </section>
  );
}
