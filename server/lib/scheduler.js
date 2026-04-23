import { readJson, writeJson, slugify, uniqueSlug, estimateReadTime } from './store.js';
import { chatComplete, blogModel } from './openrouter.js';
import { BLOG_WRITER_SYSTEM } from './prompts.js';
import { publishToAll } from './social.js';
import { parseBlogDraft } from './blog-parser.js';

// ─── Topic pool (same as scripts/generate-blog.js) ──────────────────────────
const TOPIC_POOL = [
  { topic: 'How NLP patterns quietly reshape limiting beliefs', category: 'NLP & Mindset' },
  { topic: 'Why your nervous system holds the key to healing trauma', category: 'Trauma & Healing' },
  { topic: 'Rebuilding trust after betrayal in a long relationship', category: 'Relationships' },
  { topic: 'The overlooked role of identity work in addiction recovery', category: 'Addiction & Recovery' },
  { topic: 'Small daily rituals that rewire anxious thinking', category: 'Anxiety & Depression' },
  { topic: 'Parenting teens without losing yourself in their storm', category: 'Parenting & Family' },
  { topic: 'The Quantum Leap Breakthrough: what actually shifts in 90 minutes', category: 'NLP & Mindset' },
  { topic: 'Timeline Therapy 101: releasing old emotional charges', category: 'NLP & Mindset' },
  { topic: 'What "being state" really means and how to shift yours', category: 'Spiritual Growth' },
  { topic: 'The hidden grief underneath chronic anxiety', category: 'Anxiety & Depression' },
  { topic: 'When psychotherapy stops working — and what to try next', category: 'General' },
  { topic: 'Couples work: healing as a pair, not as opponents', category: 'Relationships' },
];

// ─── Schedule parsing ───────────────────────────────────────────────────────
function parseTimes() {
  return (process.env.BLOG_TIMES || '09:00,17:00')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(s => {
      const [h, m] = s.split(':').map(Number);
      return { h: h || 0, m: m || 0 };
    });
}

function msUntilNext(times) {
  const now = new Date();
  let best = null;
  for (const t of times) {
    const candidate = new Date(now);
    candidate.setHours(t.h, t.m, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    if (!best || candidate < best) best = candidate;
  }
  return best ? best - now : null;
}

// ─── State persistence (survives restarts via the Railway volume) ──────────
const STATE_FILE = 'scheduler-state.json';

export async function getState() {
  const state = await readJson(STATE_FILE, {});
  const times = parseTimes();
  const delay = msUntilNext(times);
  const nextRun = delay != null ? new Date(Date.now() + delay).toISOString() : null;
  return {
    paused: !!state.paused,
    pausedAt: state.pausedAt || null,
    lastRun: state.lastRun || null,
    lastResult: state.lastResult || null,
    times: times.map(t => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`),
    nextRun,
  };
}

export async function setPaused(paused) {
  const state = await readJson(STATE_FILE, {});
  state.paused = !!paused;
  state.pausedAt = paused ? new Date().toISOString() : null;
  await writeJson(STATE_FILE, state);
  console.log(`[scheduler] paused=${state.paused}`);
  return getState();
}

async function recordRun(result) {
  const state = await readJson(STATE_FILE, {});
  state.lastRun = new Date().toISOString();
  state.lastResult = result;
  await writeJson(STATE_FILE, state);
}

// ─── The actual generate + publish logic (shared by scheduler + CLI) ───────
export async function generateAndPublish({ topic: overrideTopic, publishSocial = true, skipIfPaused = true } = {}) {
  if (skipIfPaused) {
    const { paused } = await getState();
    if (paused) {
      const result = { ok: false, skipped: 'paused' };
      await recordRun(result);
      console.log('[scheduler] skipped run — auto-posting is paused');
      return result;
    }
  }

  const posts = await readJson('posts.json', []);
  const usedTopics = new Set(
    posts.slice(0, 50).map(p => (p.sourceTopic || '').toLowerCase()).filter(Boolean)
  );

  let pick;
  if (overrideTopic) {
    pick = { topic: overrideTopic, category: 'General' };
  } else {
    const available = TOPIC_POOL.filter(t => !usedTopics.has(t.topic.toLowerCase()));
    const lastUsed = (posts[0]?.sourceTopic || '').toLowerCase();
    const pool = available.length
      ? available
      : TOPIC_POOL.filter(t => t.topic.toLowerCase() !== lastUsed);
    pick = pool[Math.floor(Math.random() * pool.length)];
  }

  console.log(`[scheduler] generating: "${pick.topic}" (${pick.category})`);

  const { reply } = await chatComplete({
    model: blogModel(),
    messages: [
      { role: 'system', content: BLOG_WRITER_SYSTEM },
      { role: 'user', content: `Topic: ${pick.topic}\nPreferred category: ${pick.category}\nWrite the post using the delimiter format.` },
    ],
    temperature: 0.7,
    max_tokens: 2200,
  });

  const draft = parseBlogDraft(reply, pick.category);
  if (!draft.title || !draft.body) {
    const result = { ok: false, error: 'parse_failed' };
    await recordRun(result);
    console.error('[scheduler] parse produced empty title/body. Raw:', reply.slice(0, 400));
    return result;
  }

  const title = draft.title;
  const slug = uniqueSlug(posts, slugify(title));
  const post = {
    slug,
    title,
    excerpt: draft.excerpt,
    body: draft.body,
    category: draft.category || pick.category,
    status: 'published',
    date: new Date().toISOString().split('T')[0],
    readTime: estimateReadTime(draft.body),
    sourceTopic: pick.topic,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  posts.unshift(post);
  await writeJson('posts.json', posts);
  console.log(`[scheduler] saved "${title}" (${slug})`);

  let socialResults = null;
  if (publishSocial) {
    try {
      const out = await publishToAll(post);
      socialResults = out.results;
      console.log('[scheduler] social results:', JSON.stringify(out.results));
    } catch (err) {
      console.error('[scheduler] social failed:', err.message);
      socialResults = { error: err.message };
    }
  }

  const result = { ok: true, slug, title, socialResults };
  await recordRun(result);
  return result;
}

// ─── In-process setTimeout loop ────────────────────────────────────────────
let scheduled = false;

export function startInProcess() {
  if (scheduled) return;
  scheduled = true;
  const times = parseTimes();
  console.log(`[scheduler] in-process scheduler starting. Times: ${times.map(t => `${String(t.h).padStart(2,'0')}:${String(t.m).padStart(2,'0')}`).join(', ')}`);

  const loop = () => {
    const delay = msUntilNext(parseTimes());
    if (delay == null) {
      console.log('[scheduler] no BLOG_TIMES configured — scheduler idle');
      return;
    }
    const when = new Date(Date.now() + delay);
    console.log(`[scheduler] next run at ${when.toISOString()} (in ${Math.round(delay / 60000)} min)`);
    setTimeout(async () => {
      try {
        await generateAndPublish({ publishSocial: true, skipIfPaused: true });
      } catch (err) {
        console.error('[scheduler] run failed:', err.message);
      }
      loop();
    }, delay);
  };

  loop();
}
