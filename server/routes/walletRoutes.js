import { Router } from 'express';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { getOrCreateUserDepositAddress } from '../services/hdWalletService.js';
import { creditBlockchainDeposit, runDepositWatcherCycle } from '../services/depositWatcher.js';

const router = Router();

// 1. Authenticated User Endpoint: Get or derive personal HD deposit address
router.post('/deposit-address', async (req, res) => {
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

    const { chain, asset } = req.body;
    if (!chain || !asset) {
      return res.status(400).json({ success: false, error: 'Chain and asset are required.' });
    }

    const addressData = await getOrCreateUserDepositAddress(user.id, chain, asset);
    return res.json({
      success: true,
      data: addressData
    });
  } catch (err) {
    return res.status(422).json({
      success: false,
      error: err.message || 'Could not generate deposit address.'
    });
  }
});

// 2. Authenticated User Endpoint: Trigger immediate on-demand deposit scan
router.post('/check-deposits', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    await runDepositWatcherCycle();
    return res.json({ success: true, message: 'Deposit scan completed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Webhook Receiver (Helius / Alchemy / TronGrid instant push notifications)
router.post('/webhook/deposit', async (req, res) => {
  try {
    const webhookSecret = req.headers['x-spinbox-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || webhookSecret !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json({ success: false, error: 'Forbidden webhook signature.' });
    }

    const { publicAddress, txHash, chain, asset, amountCrypto } = req.body;
    if (!publicAddress || !txHash || !chain || !asset || !amountCrypto) {
      return res.status(400).json({ success: false, error: 'Incomplete webhook payload.' });
    }

    const { data: addrRow } = await supabaseAdmin
      .from('deposit_addresses')
      .select('user_id')
      .eq('public_address', publicAddress)
      .maybeSingle();

    if (!addrRow) {
      return res.status(404).json({ success: false, error: 'Address not registered.' });
    }

    const result = await creditBlockchainDeposit({
      userId: addrRow.user_id,
      txHash,
      chain,
      asset,
      amountCrypto
    });

    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
