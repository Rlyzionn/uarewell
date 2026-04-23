import 'dotenv/config';
import { chatComplete, blogModel } from '../lib/openrouter.js';
import { BLOG_WRITER_SYSTEM } from '../lib/prompts.js';
import { readJson, writeJson, slugify, uniqueSlug, estimateReadTime } from '../lib/store.js';
import { publishToAll } from '../lib/social.js';
import { parseBlogDraft } from '../lib/blog-parser.js';

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

async function main() {
  const cliTopic = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').trim();
  const posts = await readJson('posts.json', []);
  // Dedupe on the source topic actually used (stored in `sourceTopic`), not the LLM-rewritten title.
  const usedTopics = new Set(
    posts.slice(0, 50)
      .map(p => (p.sourceTopic || '').toLowerCase())
      .filter(Boolean)
  );

  let pick;
  if (cliTopic) {
    pick = { topic: cliTopic, category: 'General' };
  } else {
    const available = TOPIC_POOL.filter(t => !usedTopics.has(t.topic.toLowerCase()));
    // If we've used every topic, reset and pick anything — but still avoid the most-recent one.
    const lastUsed = (posts[0]?.sourceTopic || '').toLowerCase();
    const pool = available.length
      ? available
      : TOPIC_POOL.filter(t => t.topic.toLowerCase() !== lastUsed);
    pick = pool[Math.floor(Math.random() * pool.length)];
  }

  console.log(`[generate] Writing: "${pick.topic}" (${pick.category})`);

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
    console.error('[generate] parse produced empty title or body. Raw output:');
    console.error(reply.slice(0, 400));
    process.exit(1);
  }

  const title = draft.title || pick.topic;
  const slug = uniqueSlug(posts, slugify(title));
  const body = draft.body;
  const publishNow = !process.argv.includes('--draft');

  const post = {
    slug,
    title,
    excerpt: draft.excerpt,
    body,
    category: draft.category || pick.category,
    status: publishNow ? 'published' : 'draft',
    date: new Date().toISOString().split('T')[0],
    readTime: estimateReadTime(body),
    sourceTopic: pick.topic,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  posts.unshift(post);
  await writeJson('posts.json', posts);
  console.log(`[generate] Saved "${title}" (${post.status}) as ${slug}`);

  if (post.status === 'published' && !process.argv.includes('--no-social')) {
    console.log('[generate] Posting to social…');
    try {
      const out = await publishToAll(post);
      console.log('[generate] Social results:', JSON.stringify(out.results, null, 2));
    } catch (err) {
      console.error('[generate] Social failed:', err.message);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
