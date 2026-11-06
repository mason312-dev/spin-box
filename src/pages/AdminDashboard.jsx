import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { supabase } from '@services/supabaseClient';
import '@styles/pages/AdminDashboard.css';

const sections = {
  metrics: { title: 'Overview', description: 'See where work is waiting and open the relevant queue.' },
  ugc: { title: 'Proof review', description: 'Check the linked win and public post before deciding.', filters: ['PENDING', 'APPROVED', 'REJECTED'] },
  fulfillment: { title: 'Fulfillment', description: 'Record carrier tracking after dispatch and confirm delivery when verified.', filters: ['READY', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
  withdrawals: { title: 'Withdrawals', description: 'Record a transaction after verifying the transfer on the correct network.', filters: ['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'] },
  links: { title: 'Product cache', description: 'Inspect saved product links and their recorded USD prices.' },
};
const statusLabel = {
  READY: 'Awaiting dispatch', PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', PROCESSING: 'Processing',
  SHIPPED: 'Shipped', DELIVERED: 'Delivered', COMPLETED: 'Completed', ALL: 'All statuses',
};
const tasks = [
  ['pendingUgcCount', 'Proofs awaiting review', 'ugc', 'PENDING'],
  ['pendingShippingCount', 'Orders awaiting dispatch', 'fulfillment', 'READY'],
  ['shippedCount', 'Orders in transit', 'fulfillment', 'SHIPPED'],
  ['pendingWithdrawalsCount', 'Pending withdrawals', 'withdrawals', 'PENDING'],
];
const money = (value) => value == null ? 'Unavailable' : new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', currencyDisplay: 'code',
}).format(Number(value));

async function adminRequest(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Your session expired. Sign in again.');
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const response = await fetch(`${base}/api/admin/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(options.body && { 'Content-Type': 'application/json' }) },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'The request could not be confirmed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function sectionLink(view, status, page = 1) {
  const params = new URLSearchParams({ view });
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  return `?${params}`;
}

export default function AdminDashboard() {
  const [params] = useSearchParams();
  const requested = params.get('view');
  const view = Object.hasOwn(sections, requested) ? requested : 'metrics';
  const section = sections[view];
  const requestedStatus = params.get('status');
  const status = section.filters ? (
    requestedStatus === 'ALL' || section.filters.includes(requestedStatus) ? requestedStatus : 'PENDING'
  ) : null;
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);
  const [active, setActive] = useState(null);
  const path = view === 'metrics' ? view : `${view}?${new URLSearchParams({ page, ...(status && { status }) })}`;
  const requestKey = `${path}:${refresh}`;
  const current = result?.key === requestKey ? result : null;
  const reload = () => setRefresh((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    adminRequest(path, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setResult({ key: requestKey, value }); })
      .catch((error) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: error.message }); });
    return () => controller.abort();
  }, [path, requestKey]);

  function finish(action, audited) {
    setActive(null);
    setNotice(audited === false ? `${action} The audit log could not be saved.` : action);
    reload();
  }

  const queue = current?.value;
  const pageCount = Math.max(1, Math.ceil((queue?.total ?? 0) / (queue?.pageSize ?? 20)));

  return (
    <main className="tsb-admin" id="main-content">
      <div className="ops-wrap">
        <header className="ops-header">
          <div><p className="ops-kicker"><ShieldCheckIcon size={19} /> TemuSpinBox / Admin</p><h1>Operations</h1>
            <p>Manage player requests and check the records behind each decision.</p></div>
          <Link className="ops-control" to="/dashboard"><ArrowLeftIcon size={17} /> Player dashboard</Link>
        </header>

        <div className="ops-layout">
          <nav className="ops-nav" aria-label="Operations sections">
            {Object.entries(sections).map(([key, item]) => (
              <Link key={key} to={sectionLink(key)} aria-current={key === view ? 'page' : undefined} onClick={() => setNotice(null)}>{item.title}</Link>
            ))}
          </nav>

          <section className="ops-content" aria-labelledby="ops-section-title">
            <div className="ops-heading">
              <div><h2 id="ops-section-title">{section.title}</h2><p>{section.description}</p></div>
              <button type="button" className="ops-control" disabled={!current} onClick={reload}>Refresh</button>
            </div>
            {notice && <p role="status" className="ops-message">{notice}</p>}
            {section.filters && <nav className="ops-filters" aria-label="Filter by status">
              {[...section.filters, 'ALL'].map((filter) => (
                <Link className="ops-control" key={filter} to={sectionLink(view, filter)}
                  aria-current={filter === status ? 'true' : undefined} onClick={() => setNotice(null)}>{statusLabel[filter]}</Link>
              ))}
            </nav>}
            {!current && <p className="ops-message" role="status">Loading {section.title.toLowerCase()}…</p>}
            {current?.error && <p className="ops-message" role="alert">{current.error}</p>}
            {queue && view === 'metrics' && <Overview metrics={queue.data} />}
            {queue && view !== 'metrics' && (
              <>
                {queue.data.length === 0 ? <p className="ops-message">{page > pageCount ? 'This page is now empty. Return to the first page.' : 'No records match this view.'}</p>
                  : <ul className="ops-records">{queue.data.map((record) => (
                    <QueueRecord key={record.id} view={view} record={record} onOpen={() => setActive({ view, record })} />
                  ))}</ul>}
                {(pageCount > 1 || page > 1) && <nav className="ops-pagination" aria-label="Queue pages">
                  {page > 1 && <Link className="ops-control" to={sectionLink(view, status, Math.min(page - 1, pageCount))}>Previous</Link>}
                  <span>Page {page} · {queue.total} records</span>
                  {page < pageCount && <Link className="ops-control" to={sectionLink(view, status, page + 1)}>Next <ArrowRightIcon size={15} /></Link>}
                </nav>}
              </>
            )}
          </section>
        </div>
      </div>
      {active && <RecordDialog key={active.record.id} {...active} onClose={() => setActive(null)} onFinish={finish} />}
    </main>
  );
}

function Overview({ metrics }) {
  return (
    <>
      <div className="ops-priorities">{tasks.map(([key, label, view, status]) => (
        <Link key={key} className="ops-priority" to={sectionLink(view, status)}>
          <span>{label}</span><strong>{metrics[key] ?? '—'}</strong><ArrowUpRightIcon size={17} />
        </Link>
      ))}</div>
      <dl className="ops-totals">
        {[['totalUsers', 'Player accounts'], ['totalSpins', 'Recorded spins'], ['totalProductsInspected', 'Cached products']].map(([key, label]) => (
          <div key={key}><dt>{label}</dt><dd>{metrics[key] ?? '—'}</dd></div>
        ))}
      </dl>
    </>
  );
}

function recordTitle(view, record) {
  if (view === 'ugc') return record.game_spins?.product_title ?? (record.proof_type === 'VIDEO_UNBOXING' ? 'Unboxing proof' : 'Wallet payout proof');
  if (view === 'withdrawals') return `${money(record.amount_usd)} · ${record.asset} on ${record.chain}`;
  return record.product_title || record.title || 'Temu item';
}

function ExternalLink({ url, children }) {
  let parsed;
  try { parsed = new URL(url); } catch { /* Missing or invalid external link. */ }
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return <p>Link unavailable.</p>;
  return <a href={parsed.href} target="_blank" rel="noopener noreferrer">{children} <ArrowUpRightIcon size={15} /></a>;
}

function QueueRecord({ view, record, onOpen }) {
  const status = record.shipping_status ?? record.status;
  const time = record.created_at ?? record.updated_at;
  return (
    <li className="ops-record">
      <div><h3>{recordTitle(view, record)}</h3>
        <p>{record.users?.email ?? (view === 'links' ? money(record.price_usd) : 'Player email unavailable')}</p>
        {time && <time dateTime={time}>{new Date(time).toLocaleDateString()}</time>}
      </div>
      {status && <span className="ops-badge" data-status={status}>{statusLabel[status] ?? status}</span>}
      {view === 'links' ? <ExternalLink url={record.product_url}>Open product</ExternalLink>
        : <button className="ops-control" type="button" onClick={onOpen}>View details <ArrowRightIcon size={16} /></button>}
    </li>
  );
}

function RecordDialog({ view, record, onClose, onFinish }) {
  const dialog = useRef(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const canDispatch = ['PENDING', 'PROCESSING'].includes(record.shipping_status);
  const canComplete = ['PENDING', 'PROCESSING'].includes(record.status);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function close() {
    if (!locked.current) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (!decision || locked.current || uncertain) return;
    const action = actions[decision];
    const value = input.trim();
    if (action.field && !value) { setError('Enter the required details.'); return; }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await adminRequest(action.path, {
        method: 'POST', body: JSON.stringify(action.payload(record.id, value)),
      });
      onFinish(action.success, result.audited);
    } catch (failure) {
      setError(failure.message);
      setUncertain(![400, 401, 403, 422].includes(failure.status));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function choose(value) {
    setDecision(value);
    setInput('');
    setError('');
  }

  const action = actions[decision];
  return (
    <dialog ref={dialog} className="ops-dialog" aria-labelledby="ops-record-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="ops-heading"><div><p className="ops-kicker">{sections[view].title}</p><h2 id="ops-record-title">{recordTitle(view, record)}</h2></div>
        <button className="ops-control" type="button" onClick={close} disabled={busy}>Close</button></div>
      <dl className="ops-detail">
        <div><dt>Player</dt><dd>{record.users?.email || 'Unavailable'}</dd></div>
        <div><dt>Reference</dt><dd>{record.id}</dd></div>
        <div><dt>Status</dt><dd>{statusLabel[record.shipping_status ?? record.status] ?? 'Unavailable'}</dd></div>
        {view === 'ugc' && <>
          <div><dt>Proof</dt><dd>{record.proof_type === 'VIDEO_UNBOXING' ? 'Unboxing video' : 'Wallet payout'} · {record.social_platform || 'Platform unavailable'}</dd></div>
          <div><dt>Linked win</dt><dd>{record.game_spins ? `${money(record.game_spins.retail_value_usd)} · ${record.game_spins.fulfillment_choice === 'LIQUIDATED' ? 'Paid to wallet' : statusLabel[record.game_spins.shipping_status] ?? 'Status unavailable'}` : 'Unavailable'}</dd></div>
          <div><dt>Recorded reward</dt><dd>{money(record.reward_credits_awarded)}</dd></div>
          {record.rejection_reason && <div><dt>Rejection reason</dt><dd>{record.rejection_reason}</dd></div>}
        </>}
        {view === 'fulfillment' && <>
          <div><dt>Recipient</dt><dd>{[record.shipping_details?.fullName, record.shipping_details?.phone].filter(Boolean).join(' · ') || 'Unavailable'}</dd></div>
          <div><dt>Address</dt><dd>{['streetAddress', 'city', 'stateProvince', 'postalCode', 'country'].map((key) => record.shipping_details?.[key]).filter(Boolean).join(', ') || 'Unavailable'}</dd></div>
          <div><dt>Item options</dt><dd>{['size', 'color', 'customNotes'].map((key) => record.product_attributes?.[key]).filter(Boolean).join(' · ') || 'Unavailable'}</dd></div>
          <div><dt>Tracking</dt><dd>{record.tracking_number || 'Pending'}</dd></div>
        </>}
        {view === 'withdrawals' && <>
          <div><dt>Source</dt><dd>{record.source_ledger === 'REFERRAL_BALANCE' ? 'Referral earnings' : record.source_ledger === 'ACCOUNT_CREDITS' ? 'Wallet balance' : 'Unavailable'}</dd></div>
          <div><dt>Destination</dt><dd>{record.destination_address || 'Unavailable'}</dd></div>
          {record.tx_hash && <div><dt>Transaction</dt><dd>{record.tx_hash}</dd></div>}
        </>}
      </dl>
      {view === 'ugc' && <ExternalLink url={record.media_url}>Open public post</ExternalLink>}
      {!decision && <div className="ops-actions">
        {view === 'ugc' && record.status === 'PENDING' && <>
          <button type="button" className="ops-control" onClick={() => choose('approve')}>Review approval</button>
          <button type="button" className="ops-control" onClick={() => choose('reject')}>Review rejection</button>
        </>}
        {view === 'fulfillment' && canDispatch && <button type="button" className="ops-control" onClick={() => choose('dispatch')}>Record dispatch</button>}
        {view === 'fulfillment' && record.shipping_status === 'SHIPPED' && <button type="button" className="ops-control" onClick={() => choose('deliver')}>Confirm delivery</button>}
        {view === 'withdrawals' && canComplete && <button type="button" className="ops-control" onClick={() => choose('complete')}>Record completed transfer</button>}
      </div>}
      {action && <form className="ops-decision" onSubmit={submit}>
        <p>{action.description}</p>
        {action.field && <label>{action.field}
          {decision === 'reject'
            ? <textarea required maxLength={500} value={input} onChange={(event) => setInput(event.target.value)} disabled={busy || uncertain} />
            : <input required minLength={decision === 'complete' ? 16 : 1} maxLength={decision === 'complete' ? 128 : 150} value={input}
              onChange={(event) => setInput(event.target.value)} disabled={busy || uncertain} />}
        </label>}
        {error && <p role="alert">{error} {uncertain && 'Close these details and refresh the queue before retrying.'}</p>}
        <div className="ops-actions">
          <button type="submit" className="ops-control ops-primary" disabled={busy || uncertain}>{busy ? 'Saving…' : action.label}</button>
          <button type="button" className="ops-control" disabled={busy || uncertain} onClick={() => choose('')}>Back</button>
        </div>
      </form>}
    </dialog>
  );
}

const actions = {
  approve: { path: 'ugc/moderate', label: 'Approve and credit reward', success: 'Proof approved and reward credited.',
    description: 'Confirm that the post matches the linked win. Approval credits the recorded reward.',
    payload: (id) => ({ submissionId: id, status: 'APPROVED' }) },
  reject: { path: 'ugc/moderate', label: 'Reject proof', success: 'Proof rejected. The reason is visible to the player.',
    field: 'Reason shown to the player', description: 'Explain what was missing or why the proof could not be verified.',
    payload: (id, reason) => ({ submissionId: id, status: 'REJECTED', reason }) },
  dispatch: { path: 'fulfillment/dispatch', label: 'Mark as shipped', success: 'Order marked shipped and tracking saved.',
    field: 'Carrier tracking number', description: 'Use the tracking number provided by the carrier after dispatch.',
    payload: (id, trackingNumber) => ({ spinId: id, trackingNumber }) },
  deliver: { path: 'fulfillment/deliver', label: 'Mark as delivered', success: 'Order marked delivered.',
    description: 'Confirm delivery only after checking the carrier record.',
    payload: (id) => ({ spinId: id }) },
  complete: { path: 'withdrawals/complete', label: 'Mark as completed', success: 'Withdrawal marked completed.',
    field: 'Blockchain transaction hash', description: 'Verify the amount, asset, network and destination before recording the completed transfer.',
    payload: (id, txHash) => ({ withdrawalId: id, txHash }) },
};
