import { readJson, writeJson } from './store.js';
import { chatComplete, chatModel } from './openrouter.js';
import { SOCIAL_WRITER_SYSTEM } from './prompts.js';

function stripJsonFences(s) {
  return String(s || '').trim()
    .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

export async function draftCaptions(post) {
  const user = `Blog title: ${post.title}\nExcerpt: ${post.excerpt}\nCategory: ${post.category}\nURL: ${(process.env.SITE_URL || 'http://localhost:8787')}/blog.html#${post.slug}`;
  const { reply } = await chatComplete({
    model: chatModel(),
    messages: [
      { role: 'system', content: SOCIAL_WRITER_SYSTEM },
      { role: 'user', content: user },
    ],
    temperature: 0.8,
    max_tokens: 600,
  });
  try { return JSON.parse(stripJsonFences(reply)); }
  catch {
    return {
      facebook: `${post.title}\n\n${post.excerpt}\n\nRead more on the blog.`,
      instagram: `${post.title}\n\n${post.excerpt}\n\n#therapy #healing #nlp #mindset`,
      linkedin: `${post.title}\n\n${post.excerpt}`,
      x: `${post.title} — ${post.excerpt.slice(0, 180)}`,
    };
  }
}

function isPublicUrl(u) {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;
    if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return false;
    if (/^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch { return false; }
}

// Strip any localhost/LAN URLs the LLM may have embedded in the caption text.
function cleanCaption(text) {
  return String(text || '')
    .replace(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?[^\s]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .trim();
}

async function postFacebook(caption, linkUrl) {
  const id = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!id || !token) return { ok: false, reason: 'missing-creds' };
  const url = `https://graph.facebook.com/v20.0/${id}/feed`;
  // FB rejects non-public URLs (localhost, LAN). Fall back to message-only and scrub URLs from caption.
  const includeLink = isPublicUrl(linkUrl);
  const message = includeLink ? caption : cleanCaption(caption);
  const params = { message, access_token: token };
  if (includeLink) params.link = linkUrl;
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, id: data.id, linkIncluded: includeLink };
  return { ok: false, reason: data.error?.message || `http-${res.status}` };
}

async function postInstagram(caption, imageUrl) {
  const id = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!id || !token || !imageUrl) return { ok: false, reason: 'missing-creds-or-image' };
  const create = await fetch(`https://graph.facebook.com/v20.0/${id}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
  });
  const cdata = await create.json().catch(() => ({}));
  if (!create.ok) return { ok: false, reason: cdata.error?.message || `http-${create.status}` };
  const publish = await fetch(`https://graph.facebook.com/v20.0/${id}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: cdata.id, access_token: token }),
  });
  const pdata = await publish.json().catch(() => ({}));
  return publish.ok ? { ok: true, id: pdata.id } : { ok: false, reason: pdata.error?.message || `http-${publish.status}` };
}

async function postLinkedIn(caption, linkUrl) {
  const token = process.env.LI_ACCESS_TOKEN;
  const author = process.env.LI_AUTHOR_URN;
  if (!token || !author) return { ok: false, reason: 'missing-creds' };
  const payload = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory: 'ARTICLE',
        media: [{ status: 'READY', originalUrl: linkUrl }],
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, id: data.id } : { ok: false, reason: data.message || `http-${res.status}` };
}

async function postX(caption) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return { ok: false, reason: 'missing-creds' };
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: caption.slice(0, 280) }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, id: data?.data?.id } : { ok: false, reason: data?.detail || data?.title || `http-${res.status}` };
}

export async function publishToAll(post) {
  const captions = await draftCaptions(post);
  const link = `${process.env.SITE_URL || 'http://localhost:8787'}/blog.html#${post.slug}`;
  const results = {};

  results.facebook  = await postFacebook(captions.facebook, link);
  results.instagram = await postInstagram(captions.instagram, post.image || '');
  results.linkedin  = await postLinkedIn(captions.linkedin, link);
  results.x         = await postX(`${captions.x} ${link}`);

  const queue = await readJson('social-queue.json', []);
  queue.unshift({
    id: `q-${Date.now()}`,
    postSlug: post.slug,
    postTitle: post.title,
    link,
    captions,
    results,
    createdAt: new Date().toISOString(),
  });
  await writeJson('social-queue.json', queue.slice(0, 500));
  return { captions, results };
}
