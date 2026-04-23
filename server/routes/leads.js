import express from 'express';
import { readJson, writeJson } from '../lib/store.js';
import { sendLeadEmail } from '../lib/email.js';
import { requireAdmin } from './admin-auth.js';

const router = express.Router();

const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

router.post('/leads', async (req, res) => {
  try {
    const b = req.body || {};
    const first = (b.firstName || '').trim();
    const last = (b.lastName || '').trim();
    const name = (b.name || `${first} ${last}`).trim();
    const email = (b.email || '').trim();
    const phone = (b.phone || '').trim();
    const interest = (b.interest || b.service || '').trim();
    const message = (b.message || b.notes || '').trim();

    if (!email && !phone) return res.status(400).json({ error: 'email_or_phone_required' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });

    const lead = {
      id: `lead-${Date.now()}`,
      createdAt: new Date().toISOString(),
      source: 'contact-form',
      name: name || null,
      email: email || null,
      phone: phone || null,
      interest: interest || null,
      message: message || null,
      intent: /book|call|session|discovery/i.test(message + ' ' + interest) ? 'hot' : 'warm',
    };

    const leads = await readJson('leads.json', []);
    leads.unshift(lead);
    await writeJson('leads.json', leads.slice(0, 2000));
    const emailResult = await sendLeadEmail(lead);
    res.json({ ok: true, emailed: emailResult.sent });
  } catch (err) {
    console.error('[leads] error:', err.message);
    res.status(500).json({ error: 'save_failed', message: err.message });
  }
});

router.get('/admin/leads', requireAdmin, async (_req, res) => {
  const leads = await readJson('leads.json', []);
  res.json(leads);
});

router.delete('/admin/leads/:id', requireAdmin, async (req, res) => {
  const leads = await readJson('leads.json', []);
  const next = leads.filter(l => l.id !== req.params.id);
  if (next.length === leads.length) return res.status(404).json({ error: 'not_found' });
  await writeJson('leads.json', next);
  res.json({ ok: true });
});

export default router;
