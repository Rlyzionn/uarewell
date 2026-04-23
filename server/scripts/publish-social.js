import 'dotenv/config';
import { readJson } from '../lib/store.js';
import { publishToAll } from '../lib/social.js';

async function main() {
  const slug = process.argv[2];
  const posts = await readJson('posts.json', []);
  const post = slug
    ? posts.find(p => p.slug === slug)
    : posts.find(p => p.status === 'published');
  if (!post) {
    console.error(`No post found${slug ? ` for slug "${slug}"` : ''}.`);
    process.exit(1);
  }
  console.log(`[publish-social] Posting "${post.title}"…`);
  const out = await publishToAll(post);
  console.log(JSON.stringify(out.results, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
