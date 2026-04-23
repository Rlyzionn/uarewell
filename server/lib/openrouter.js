const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildHeaders() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is missing in .env');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:8787',
    'X-Title': process.env.OPENROUTER_SITE_NAME || 'UAreWell TheraCoach',
  };
}

export async function chatComplete({ model, messages, temperature = 0.7, max_tokens = 800, response_format }) {
  const body = { model, messages, temperature, max_tokens };
  if (response_format) body.response_format = response_format;

  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 500)}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content ?? '';
  return { reply, raw: data };
}

export function chatModel() { return process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini'; }
export function blogModel() { return process.env.OPENROUTER_BLOG_MODEL || 'anthropic/claude-sonnet-4.5'; }
