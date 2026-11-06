import { Router } from 'express';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { sendShipmentEmail, sendWithdrawalCompletedEmail } from '../services/emailService.js';

const router = Router();

// Middleware: Verify Admin Access via Supabase JWT
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing authorization token.' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.is_admin) {
      return res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.use(requireAdmin);

const pageSize = 20;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function fail(res, error) {
  console.error('[Admin operation]', error);
  return res.status(500).json({ success: false, error: 'Admin operation could not be confirmed. Refresh before retrying.' });
}

router.get('/metrics', async (_req, res) => {
  try {
    const count = (table) => supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
    const queries = {
      totalUsers: count('users'),
      totalSpins: count('game_spins'),
      totalProductsInspected: count('temu_products'),
      pendingWithdrawalsCount: count('withdrawals').eq('status', 'PENDING'),
      pendingUgcCount: count('ugc_proof_submissions').eq('status', 'PENDING'),
      pendingShippingCount: count('game_spins').eq('fulfillment_choice', 'SHIPPED').in('shipping_status', ['PENDING', 'PROCESSING']),
      shippedCount: count('game_spins').eq('fulfillment_choice', 'SHIPPED').eq('shipping_status', 'SHIPPED'),
    };
    const data = Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([name, query]) => {
      const { count: total, error } = await query;
      if (error) throw error;
      return [name, total];
    })));
    return res.json({ success: true, data });
  } catch (error) {
    return fail(res, error);
  }
});

const queues = [
  { path: 'links', table: 'temu_products', fields: 'id,title,product_url,price_usd,updated_at', order: 'updated_at' },
  { path: 'ugc', table: 'ugc_proof_submissions', fields: '*,users(email),game_spins(product_title,retail_value_usd,fulfillment_choice,shipping_status)', status: 'status', allowed: ['PENDING', 'APPROVED', 'REJECTED'] },
  { path: 'fulfillment', table: 'game_spins', fields: 'id,product_title,retail_value_usd,product_attributes,shipping_details,tracking_number,shipping_status,created_at,users(email)', status: 'shipping_status', allowed: ['READY', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
  { path: 'withdrawals', table: 'withdrawals', fields: '*,users(email)', status: 'status', allowed: ['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED'] },
];

for (const queue of queues) {
  router.get('/' + queue.path, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const filter = req.query.status;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000
      || (filter && filter !== 'ALL' && !queue.allowed?.includes(filter))) {
      return res.status(400).json({ success: false, error: 'Invalid queue filter or page.' });
    }
    try {
      const start = (page - 1) * pageSize;
      let query = supabaseAdmin.from(queue.table).select(queue.fields, { count: 'exact' });
      if (queue.path === 'fulfillment') query = query.eq('fulfillment_choice', 'SHIPPED');
      if (filter === 'READY') query = query.in(queue.status, ['PENDING', 'PROCESSING']);
      else if (filter && filter !== 'ALL') query = query.eq(queue.status, filter);
      const { data, error, count } = await query.order(queue.order ?? 'created_at', { ascending: false })
        .order('id', { ascending: false }).range(start, start + pageSize - 1);
      if (error) throw error;
      return res.json({ success: true, data: data ?? [], total: count ?? 0, pageSize });
    } catch (error) {
      return fail(res, error);
    }
  });
}

router.post('/ugc/moderate', async (req, res) => {
  const { submissionId, status } = req.body ?? {};
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!uuid.test(submissionId) || !['APPROVED', 'REJECTED'].includes(status)
    || (status === 'REJECTED' && (!reason || reason.length > 500))) {
    return res.status(400).json({ success: false, error: 'A valid decision and rejection reason are required.' });
  }
  try {
    const { error } = await supabaseAdmin.rpc('review_ugc_proof', {
      p_admin_id: req.adminUser.id, p_submission_id: submissionId, p_status: status, p_reason: reason,
    });
    if (error?.code === 'P0002') return res.status(409).json({ success: false, error: 'This proof is no longer pending. Refresh the queue.' });
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return fail(res, error);
  }
});

async function recordAudit(req, action, id, metadata) {
  const { error } = await supabaseAdmin.from('admin_audit_logs').insert({
    admin_id: req.adminUser.id, action_type: action, target_id: id, metadata,
  });
  if (error) console.error('[Admin audit write failed]', action, id, error);
  return !error;
}

function conflict(res) {
  return res.status(409).json({ success: false, error: 'The record has changed. Refresh the queue before continuing.' });
}

async function notify(row, sendEmail, details) {
  if (!row.users?.email) return;
  try {
    await sendEmail(row.users.email, details);
  } catch (error) {
    console.error('[Admin notification failed]', row.id, error);
  }
}

router.post('/fulfillment/dispatch', async (req, res) => {
  const { spinId } = req.body ?? {};
  const trackingNumber = typeof req.body?.trackingNumber === 'string' ? req.body.trackingNumber.trim() : '';
  if (!uuid.test(spinId) || !trackingNumber || trackingNumber.length > 150) {
    return res.status(400).json({ success: false, error: 'Enter a valid order and tracking number.' });
  }
  try {
    const { data, error } = await supabaseAdmin.from('game_spins')
      .update({ tracking_number: trackingNumber, shipping_status: 'SHIPPED' }).eq('id', spinId)
      .eq('fulfillment_choice', 'SHIPPED').in('shipping_status', ['PENDING', 'PROCESSING'])
      .select('id,product_title,users(email)').maybeSingle();
    if (error) throw error;
    if (!data) return conflict(res);
    const audited = await recordAudit(req, 'DISPATCH_SHIPPING', spinId, { trackingNumber });
    await notify(data, sendShipmentEmail, { itemTitle: data.product_title || 'Temu item', trackingNumber });
    return res.json({ success: true, audited });
  } catch (error) {
    return fail(res, error);
  }
});

router.post('/fulfillment/deliver', async (req, res) => {
  const { spinId } = req.body ?? {};
  if (!uuid.test(spinId)) return res.status(400).json({ success: false, error: 'Enter a valid order.' });
  try {
    const { data, error } = await supabaseAdmin.from('game_spins')
      .update({ shipping_status: 'DELIVERED' }).eq('id', spinId)
      .eq('fulfillment_choice', 'SHIPPED').eq('shipping_status', 'SHIPPED')
      .select('id').maybeSingle();
    if (error) throw error;
    if (!data) return conflict(res);
    const audited = await recordAudit(req, 'CONFIRM_DELIVERY', spinId, {});
    return res.json({ success: true, audited });
  } catch (error) {
    return fail(res, error);
  }
});

router.post('/withdrawals/complete', async (req, res) => {
  const { withdrawalId } = req.body ?? {};
  const txHash = typeof req.body?.txHash === 'string' ? req.body.txHash.trim() : '';
  if (!uuid.test(withdrawalId) || !/^[a-zA-Z0-9]{16,128}$/.test(txHash)) {
    return res.status(400).json({ success: false, error: 'Enter a valid withdrawal and transaction hash.' });
  }
  try {
    const { data, error } = await supabaseAdmin.from('withdrawals')
      .update({ status: 'COMPLETED', tx_hash: txHash }).eq('id', withdrawalId)
      .in('status', ['PENDING', 'PROCESSING'])
      .select('id,amount_usd,asset,chain,users(email)').maybeSingle();
    if (error) throw error;
    if (!data) return conflict(res);
    const audited = await recordAudit(req, 'COMPLETE_WITHDRAWAL', withdrawalId, { txHash, amountUsd: data.amount_usd });
    await notify(data, sendWithdrawalCompletedEmail, { amountUsd: data.amount_usd, asset: data.asset, chain: data.chain, txHash });
    return res.json({ success: true, audited });
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
