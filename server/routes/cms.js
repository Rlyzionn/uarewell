import express from 'express';
import { readJson, writeJson, slugify, uniqueSlug, estimateReadTime } from '../lib/store.js';
import { chatComplete, blogModel } from '../lib/openrouter.js';
import { BLOG_WRITER_SYSTEM } from '../lib/prompts.js';
import { publishToAll } from '../lib/social.js';
import { requireAdmin } from './admin-auth.js';
import { parseBlogDraft, CATEGORIES } from '../lib/blog-parser.js';

const router = express.Router();

function publicView(p) {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    body: p.body,
    category: p.category,
    date: p.date,
    readTime: p.readTime,
    status: p.status,
  };
}

router.get('/posts', async (_req, res) => {
  const posts = await readJson('posts.json', []);
  const published = posts
    .filter(p => p.status === 'published')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(publicView);
  res.json(published);
});

router.get('/posts/:slug', async (req, res) => {
  const posts = await readJson('posts.json', []);
  const post = posts.find(p => p.slug === req.params.slug && p.status === 'published');
  if (!post) return res.status(404).json({ error: 'not_found' });
  res.json(publicView(post));
});

router.get('/admin/posts', requireAdmin, async (_req, res) => {
  const posts = await readJson('posts.json', []);
  res.json([...posts].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
});

router.get('/admin/posts/:slug', requireAdmin, async (req, res) => {
  const posts = await readJson('posts.json', []);
  const post = posts.find(p => p.slug === req.params.slug);
  if (!post) return res.status(404).json({ error: 'not_found' });
  res.json(post);
});

router.post('/admin/posts', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title_required' });

  const posts = await readJson('posts.json', []);
  const slug = uniqueSlug(posts, slugify(title));
  const body = String(b.body || '');
  const post = {
    slug,
    title,
    excerpt: String(b.excerpt || '').trim(),
    body,
    category: CATEGORIES.includes(b.category) ? b.category : 'General',
    status: b.status === 'published' ? 'published' : 'draft',
    date: b.date || new Date().toISOString().split('T')[0],
    readTime: estimateReadTime(body),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  posts.unshift(post);
  await writeJson('posts.json', posts);

  if (post.status === 'published') triggerSocial(post);
  res.json(post);
});

router.put('/admin/posts/:slug', requireAdmin, async (req, res) => {
  const posts = await readJson('posts.json', []);
  const idx = posts.findIndex(p => p.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const existing = posts[idx];
  const b = req.body || {};

  const wasPublished = existing.status === 'published';
  const next = {
    ...existing,
    title: b.title !== undefined ? String(b.title).trim() : existing.title,
    excerpt: b.excerpt !== undefined ? String(b.excerpt).trim() : existing.excerpt,
    body: b.body !== undefined ? String(b.body) : existing.body,
    category: CATEGORIES.includes(b.category) ? b.category : existing.category,
    status: b.status === 'published' || b.status === 'draft' ? b.status : existing.status,
    date: b.date || existing.date,
    updatedAt: new Date().toISOString(),
  };
  next.readTime = estimateReadTime(next.body);
  posts[idx] = next;
  await writeJson('posts.json', posts);

  if (!wasPublished && next.status === 'published') triggerSocial(next);
  res.json(next);
});

router.delete('/admin/posts/:slug', requireAdmin, async (req, res) => {
  const posts = await readJson('posts.json', []);
  const next = posts.filter(p => p.slug !== req.params.slug);
  if (next.length === posts.length) return res.status(404).json({ error: 'not_found' });
  await writeJson('posts.json', next);
  res.json({ ok: true });
});

router.post('/admin/ai-write', requireAdmin, async (req, res) => {
  const topic = String(req.body?.topic || '').trim();
  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'General';
  if (!topic) return res.status(400).json({ error: 'topic_required' });

  try {
    const { reply } = await chatComplete({
      model: blogModel(),
      messages: [
        { role: 'system', content: BLOG_WRITER_SYSTEM },
        { role: 'user', content: `Topic: ${topic}\nPreferred category: ${category}\nWrite the post using the delimiter format.` },
      ],
      temperature: 0.7,
      max_tokens: 2200,
    });
    const parsed = parseBlogDraft(reply, category);
    if (!parsed.title || !parsed.body) {
      return res.status(500).json({ error: 'ai_parse_failed', message: 'Model output could not be parsed' });
    }
    res.json(parsed);
  } catch (err) {
    console.error('[ai-write] failed:', err.message);
    res.status(500).json({ error: 'ai_failed', message: err.message });
  }
});

router.post('/admin/posts/:slug/publish-social', requireAdmin, async (req, res) => {
  const posts = await readJson('posts.json', []);
  const post = posts.find(p => p.slug === req.params.slug);
  if (!post) return res.status(404).json({ error: 'not_found' });
  try {
    const out = await publishToAll(post);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'social_failed', message: err.message });
  }
});

router.get('/admin/social-queue', requireAdmin, async (_req, res) => {
  const q = await readJson('social-queue.json', []);
  res.json(q);
});

function triggerSocial(post) {
  setImmediate(async () => {
    try {
      const out = await publishToAll(post);
      console.log(`[social] posted "${post.title}":`, JSON.stringify(out.results));
    } catch (err) {
      console.error('[social] failed:', err.message);
    }
  });
}

export default router;
