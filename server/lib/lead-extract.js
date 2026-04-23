import { chatComplete, chatModel } from './openrouter.js';
import { LEAD_EXTRACT_SYSTEM } from './prompts.js';

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\b\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/;

export function hasContactSignal(messages) {
  const text = messages.map(m => m.content).join(' ');
  return EMAIL_RE.test(text) || PHONE_RE.test(text);
}

function stripJsonFences(s) {
  return String(s || '').trim()
    .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

export async function extractLead(messages) {
  const transcript = messages
    .filter(m => m.content && m.content !== '__greet__')
    .map(m => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`)
    .join('\n');
  const { reply } = await chatComplete({
    model: chatModel(),
    messages: [
      { role: 'system', content: LEAD_EXTRACT_SYSTEM },
      { role: 'user', content: `Chat transcript:\n\n${transcript}\n\nReturn JSON.` },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });
  try {
    const parsed = JSON.parse(stripJsonFences(reply));
    return {
      name: parsed.name || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      interest: parsed.interest || null,
      notes: parsed.notes || '',
      intent: parsed.intent || 'unknown',
    };
  } catch {
    const text = messages.map(m => m.content).join(' ');
    return {
      name: null,
      email: (text.match(EMAIL_RE) || [])[0] || null,
      phone: (text.match(PHONE_RE) || [])[0] || null,
      interest: null,
      notes: '(extraction fallback)',
      intent: 'unknown',
    };
  }
}
