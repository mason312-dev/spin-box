const RESEND_API_URL = 'https://api.resend.com/emails';
const DASHBOARD_URL = 'https://temuspinbox.com/dashboard';

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'TemuSpinBox <noreply@temuspinbox.com>';
}

async function dispatchResendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) {
    throw new Error('Missing RESEND_API_KEY in server/.env');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    }),
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || 'Resend API failed to dispatch email.');
  }
  return data;
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

function renderEmail({ heading, intro, code, rows = [], note, action }) {
  const details = rows.map(([label, value]) => `
    <tr><td style="padding:9px 12px;border-bottom:1px solid #cbbdaa;overflow-wrap:anywhere;word-break:break-word;">
      <span style="display:block;font-size:12px;color:#594738;">${escapeHtml(label)}</span>
      <strong style="font-size:15px;color:#28231e;">${escapeHtml(value)}</strong>
    </td></tr>`).join('');
  const codeBlock = code == null ? '' : `
    <p style="margin:20px 0;padding:16px;background:#f1e9da;color:#28231e;text-align:center;font-family:monospace;font-size:32px;font-weight:700;letter-spacing:5px;">
      ${escapeHtml(code)}
    </p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#1b1918;color:#f1eee7;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1b1918;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;table-layout:fixed;border:1px solid #806b5f;background:#262220;">
<tr><td style="padding:14px 20px;border-top:4px solid #ff7057;border-bottom:1px solid #806b5f;font-size:18px;font-weight:700;">Temu<span style="color:#ff9d88;">Spin</span>Box</td></tr>
<tr><td style="padding:22px 20px;">
  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.12;">${escapeHtml(heading)}</h1>
  <p style="margin:0 0 15px;line-height:1.55;color:#dbcabd;">${escapeHtml(intro)}</p>
  ${codeBlock}
  ${details ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;background:#f1e9da;">${details}</table>` : ''}
  <p style="margin:16px 0 0;line-height:1.55;color:#dbcabd;">${escapeHtml(note)}</p>
  ${action ? `<p style="margin:18px 0 0;"><a href="${DASHBOARD_URL}" style="display:inline-block;padding:12px 15px;background:#ff7057;color:#28140e;font-weight:700;text-decoration:none;">${escapeHtml(action)}</a></p>` : ''}
</td></tr>
</table>
<p style="margin:16px 0 0;color:#cec0b4;font-size:12px;">TemuSpinBox · Independent product spin platform</p>
</td></tr></table>
</body></html>`;
  const text = [
    'TemuSpinBox', heading, intro, code,
    rows.length ? rows.map(([label, value]) => `${label}: ${value}`).join('\n') : null,
    note, action ? `${action}: ${DASHBOARD_URL}` : null,
  ].filter(Boolean).join('\n\n');
  return { html, text };
}

function send(to, subject, content) {
  return dispatchResendEmail({ to, subject, ...renderEmail(content) });
}

export function sendOtpEmail(toEmail, otpCode) {
  return send(toEmail, 'Your TemuSpinBox sign-in code', {
    heading: 'Sign in to TemuSpinBox',
    intro: 'Enter this code in the sign-in window. It expires in 10 minutes.',
    code: otpCode,
    note: 'Keep this code private. If you didn’t request it, you can ignore this email.',
  });
}

export function sendDepositConfirmedEmail(toEmail, { amountUsd, asset, chain, txHash }) {
  return send(toEmail, 'Your TemuSpinBox deposit is confirmed', {
    heading: 'Deposit credited',
    intro: 'Your deposit has been added to your TemuSpinBox wallet.',
    rows: [
      ['Amount credited', `USD ${Number(amountUsd).toFixed(2)}`],
      ['Asset and network', `${asset} on ${chain}`],
      ['Transaction reference', txHash],
    ],
    note: 'Sign in and open Wallet to see your updated balance.',
    action: 'Open player dashboard',
  });
}

export function sendShipmentEmail(toEmail, { itemTitle, trackingNumber }) {
  return send(toEmail, 'Your TemuSpinBox prize has shipped', {
    heading: 'Your prize has shipped',
    intro: 'Your item has been dispatched. Keep the tracking number below for your records.',
    rows: [['Item', itemTitle], ['Carrier tracking number', trackingNumber]],
    note: 'Sign in and open Orders on your dashboard to see the latest status.',
    action: 'Open player dashboard',
  });
}

export function sendWithdrawalCompletedEmail(toEmail, { amountUsd, asset, chain, txHash }) {
  return send(toEmail, 'Your TemuSpinBox withdrawal is complete', {
    heading: 'Withdrawal completed',
    intro: 'Your withdrawal has been marked complete.',
    rows: [
      ['Requested amount', `USD ${Number(amountUsd).toFixed(2)}`],
      ['Asset and network', `${asset} on ${chain}`],
      ['Transaction reference', txHash],
    ],
    note: 'Use the transaction reference to look up the transfer on the listed network.',
    action: 'Open player dashboard',
  });
}
