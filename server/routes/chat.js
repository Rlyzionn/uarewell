import express from 'express';
import { chatComplete, chatModel } from '../lib/openrouter.js';
import { CHAT_SYSTEM } from '../lib/prompts.js';
import { extractLead, hasContactSignal } from '../lib/lead-extract.js';
import { readJson, writeJson } from '../lib/store.js';
import { sendLeadEmail } from '../lib/email.js';

const router = express.Router();

router.post('/chat', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!incoming.length) return res.status(400).json({ error: 'messages required' });

    const last = incoming[incoming.length - 1];
    if (last?.role === 'user' && last.content === '__greet__') {
      return res.json({
        reply: "Hi there 🌿 I'm Susan's practice assistant. Ask me anything about her services, her approach to healing, or how to get started — I'm here whenever you need."
      });
    }

    const safeMessages = incoming
      .filter(m => m && typeof m.content === 'string' && m.content !== '__greet__')
      .slice(-24)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const { reply } = await chatComplete({
      model: chatModel(),
      messages: [{ role: 'system', content: CHAT_SYSTEM }, ...safeMessages],
      temperature: 0.75,
      max_tokens: 400,
    });

    res.json({ reply });

    // Background: detect + persist leads when contact info shows up
    queueMicrotask(async () => {
      try {
        if (!hasContactSignal(safeMessages)) return;
        const extracted = await extractLead(safeMessages);
        if (!extracted.email && !extracted.phone) return;

        const leads = await readJson('leads.json', []);
        const fingerprint = `${extracted.email || ''}|${extracted.phone || ''}`;
        if (leads.some(l => `${l.email || ''}|${l.phone || ''}` === fingerprint && l.source === 'chat')) return;

        const lead = {
          id: `lead-${Date.now()}`,
          createdAt: new Date().toISOString(),
          source: 'chat',
          ...extracted,
          transcript: safeMessages,
        };
        leads.unshift(lead);
        await writeJson('leads.json', leads.slice(0, 2000));
        await sendLeadEmail(lead);
        console.log(`[chat] captured lead (${lead.intent}): ${lead.email || lead.phone}`);
      } catch (err) {
        console.error('[chat] lead extraction failed:', err.message);
      }
    });
  } catch (err) {
    console.error('[chat] error:', err.message);
    res.status(500).json({ error: 'chat_failed', message: err.message });
  }
});

export default router;
