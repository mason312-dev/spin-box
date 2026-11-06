import crypto from 'node:crypto';
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { sendOtpEmail } from '../services/emailService.js';

const router = Router();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MS = 45 * 1000;   // 45 seconds cooldown per email

function hashOtp(email, code) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'spinbox-otp-salt';
  return crypto
    .createHmac('sha256', secret)
    .update(`${email.toLowerCase().trim()}:${code.trim()}`)
    .digest('hex');
}

// 1. POST /api/auth/send-otp — Generate 6-digit OTP, store hash in public.email_otps, send via Resend
router.post('/send-otp', async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const referrerId = req.body?.referrerId || null;

    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    const email = rawEmail.toLowerCase().trim();

    // Check rate limit on most recent unconsumed OTP
    const { data: recentOtp } = await supabaseAdmin
      .from('email_otps')
      .select('created_at')
      .eq('email', email)
      .eq('consumed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentOtp) {
      const elapsed = Date.now() - new Date(recentOtp.created_at).getTime();
      if (elapsed < RATE_LIMIT_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitSec}s before requesting another code.`
        });
      }
    }

    // Generate cryptographically secure 6-digit OTP
    const otpCode = String(crypto.randomInt(100000, 1000000));
    const otpHash = hashOtp(email, otpCode);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Invalidate previous unconsumed OTPs for this email
    await supabaseAdmin
      .from('email_otps')
      .update({ consumed: true })
      .eq('email', email)
      .eq('consumed', false);

    // Store hashed OTP in public.email_otps
    const { error: insertErr } = await supabaseAdmin.from('email_otps').insert({
      email,
      otp_hash: otpHash,
      referrer_id: referrerId,
      expires_at: expiresAt,
      consumed: false
    });

    if (insertErr) throw new Error(insertErr.message);

    // Dispatch email via Resend
    await sendOtpEmail(email, otpCode);

    return res.json({
      success: true,
      message: 'Verification code sent via Resend. Check your inbox.'
    });
  } catch (err) {
    return res.status(422).json({
      success: false,
      error: err.message || 'Could not send verification code.'
    });
  }
});

// 2. POST /api/auth/verify-otp — Verify hash in public.email_otps & mint official Supabase Auth token
router.post('/verify-otp', async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const rawCode = req.body?.token;
    const fallbackRef = req.body?.referrerId || null;

    if (!rawEmail || !rawCode) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit code are required.' });
    }

    const email = rawEmail.toLowerCase().trim();
    const code = String(rawCode).trim();
    const expectedHash = hashOtp(email, code);

    const { data: otpRow, error: otpErr } = await supabaseAdmin
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .eq('otp_hash', expectedHash)
      .eq('consumed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr || !otpRow) {
      return res.status(401).json({ success: false, error: 'Invalid 6-digit verification code.' });
    }

    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ success: false, error: 'Verification code has expired. Request a new one.' });
    }

    // Mark OTP as consumed atomically
    await supabaseAdmin
      .from('email_otps')
      .update({ consumed: true })
      .eq('id', otpRow.id);

    const referrerToAttach = otpRow.referrer_id || fallbackRef;

    // Ensure user exists in Supabase Auth (or create confirmed user so handle_new_auth_user trigger runs)
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        referrer_id: referrerToAttach
      }
    });
    // Ignore error if user already exists; generateLink below works for both new and existing users.

    // Generate official Supabase magiclink token_hash server-side without sending any Supabase email
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message || 'Failed to initialize authenticated session.');
    }

    return res.json({
      success: true,
      data: {
        email,
        tokenHash: linkData.properties.hashed_token
      }
    });
  } catch (err) {
    return res.status(422).json({
      success: false,
      error: err.message || 'Verification failed.'
    });
  }
});

export default router;
