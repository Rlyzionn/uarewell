import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chatRoute from './routes/chat.js';
import cmsRoute from './routes/cms.js';
import leadsRoute from './routes/leads.js';
import adminAuth from './routes/admin-auth.js';
import schedulerRoute from './routes/scheduler.js';
import { isEmailEnabled } from './lib/email.js';
import { startInProcess as startScheduler } from './lib/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname); // server/ (contains index.html, blog.html, admin.html, images/)

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Small request log
app.use((req, _res, next) => {
  if (!req.url.startsWith('/images/') && !req.url.endsWith('.ico')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  }
  next();
});

// Serve the static site from the parent folder so http://localhost:PORT loads index.html
app.use(express.static(SITE_ROOT, { extensions: ['html'] }));

// API routes
app.use('/', chatRoute);
app.use('/', leadsRoute);
app.use('/', cmsRoute);
app.use('/', adminAuth);
app.use('/', schedulerRoute);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    openrouter: !!process.env.OPENROUTER_API_KEY,
    email: isEmailEnabled(),
  });
});

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => {
  console.log('────────────────────────────────────────────');
  console.log(` UAreWell server running`);
  console.log(` Site:    http://localhost:${PORT}/index.html`);
  console.log(` Blog:    http://localhost:${PORT}/blog.html`);
  console.log(` Admin:   http://localhost:${PORT}/admin.html`);
  console.log(` Health:  http://localhost:${PORT}/health`);
  console.log(` OpenRouter: ${process.env.OPENROUTER_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(` Email:      ${isEmailEnabled() ? 'configured' : 'disabled (leads save to file)'}`);
  console.log('────────────────────────────────────────────');
  // Kick off the in-process blog scheduler (checks BLOG_TIMES, respects pause flag)
  try { startScheduler(); } catch (err) { console.error('[scheduler] failed to start:', err.message); }
});
