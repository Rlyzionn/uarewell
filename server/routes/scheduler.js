import express from 'express';
import { requireAdmin } from './admin-auth.js';
import { getState, setPaused, generateAndPublish } from '../lib/scheduler.js';

const router = express.Router();

router.get('/admin/scheduler', requireAdmin, async (_req, res) => {
  try {
    res.json(await getState());
  } catch (err) {
    res.status(500).json({ error: 'state_failed', message: err.message });
  }
});

router.post('/admin/scheduler/toggle', requireAdmin, async (_req, res) => {
  try {
    const current = await getState();
    const next = await setPaused(!current.paused);
    res.json(next);
  } catch (err) {
    res.status(500).json({ error: 'toggle_failed', message: err.message });
  }
});

router.post('/admin/scheduler/run', requireAdmin, async (req, res) => {
  // Force-ignore the pause flag so admin can manually trigger even when paused
  const force = req.body?.force === true;
  try {
    const result = await generateAndPublish({ skipIfPaused: !force });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'run_failed', message: err.message });
  }
});

export default router;
