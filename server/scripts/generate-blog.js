import 'dotenv/config';
import { generateAndPublish } from '../lib/scheduler.js';

async function main() {
  const cliTopic = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').trim();
  const draftOnly = process.argv.includes('--draft');
  const noSocial = process.argv.includes('--no-social');
  const force = process.argv.includes('--force'); // ignore the paused flag

  if (draftOnly) {
    console.warn('[generate-blog] --draft is no longer supported by the shared flow; always publishes.');
  }

  const result = await generateAndPublish({
    topic: cliTopic || undefined,
    publishSocial: !noSocial,
    skipIfPaused: !force,
  });

  if (!result.ok) {
    console.error('[generate-blog] skipped/failed:', result.skipped || result.error || result);
    process.exit(result.skipped === 'paused' ? 0 : 1);
  }
  console.log(`[generate-blog] OK — ${result.title} (${result.slug})`);
}

main().catch(err => { console.error(err); process.exit(1); });
