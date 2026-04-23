import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two posts per day by default. Override via BLOG_TIMES in .env (24h, comma-separated).
const TIMES = (process.env.BLOG_TIMES || '09:00,17:00')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => {
    const [h, m] = s.split(':').map(Number);
    return { h: h || 0, m: m || 0 };
  });

function msUntilNext() {
  const now = new Date();
  let best = null;
  for (const t of TIMES) {
    const candidate = new Date(now);
    candidate.setHours(t.h, t.m, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    if (!best || candidate < best) best = candidate;
  }
  return best - now;
}

function runGenerator() {
  console.log(`[scheduler] ${new Date().toISOString()} — running blog generator`);
  const child = spawn(process.execPath, [path.join(__dirname, 'generate-blog.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', code => console.log(`[scheduler] generator exited ${code}`));
}

function schedule() {
  const delay = msUntilNext();
  const when = new Date(Date.now() + delay);
  console.log(`[scheduler] next run at ${when.toLocaleString()} (in ${Math.round(delay/60000)} min)`);
  setTimeout(() => {
    runGenerator();
    schedule();
  }, delay);
}

console.log(`[scheduler] Started. Posting ${TIMES.length}× per day at ${TIMES.map(t => `${String(t.h).padStart(2,'0')}:${String(t.m).padStart(2,'0')}`).join(', ')}.`);
schedule();
