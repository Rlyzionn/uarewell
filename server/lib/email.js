import nodemailer from 'nodemailer';

let cached = null;

export function isEmailEnabled() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport() {
  if (cached) return cached;
  if (!isEmailEnabled()) return null;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cached;
}

export async function sendLeadEmail(lead) {
  if (!isEmailEnabled()) {
    console.log('[email] SMTP not configured — skipping. Lead saved to leads.json.');
    return { sent: false, reason: 'smtp-not-configured' };
  }
  const t = transport();
  const to = process.env.LEADS_TO || process.env.SMTP_USER;
  const subject = `New lead from UAreWell site — ${lead.name || lead.email || 'anonymous'}${lead.intent === 'hot' ? ' 🔥 HOT' : ''}`;
  const lines = [
    `Source:   ${lead.source}`,
    `Received: ${new Date(lead.createdAt).toLocaleString()}`,
    `Name:     ${lead.name || '—'}`,
    `Email:    ${lead.email || '—'}`,
    `Phone:    ${lead.phone || '—'}`,
    `Interest: ${lead.interest || '—'}`,
    `Intent:   ${lead.intent || '—'}`,
    '',
    'Notes / message:',
    (lead.message || lead.notes || '').trim() || '—',
  ];
  if (lead.transcript?.length) {
    lines.push('', '— Chat transcript —');
    for (const m of lead.transcript) {
      lines.push(`${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`);
    }
  }
  const text = lines.join('\n');
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}
