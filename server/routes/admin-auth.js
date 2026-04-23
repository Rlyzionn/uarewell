import express from 'express';

const router = express.Router();

export function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'admin_password_not_set' });
  if (!token || token !== expected) return res.status(401).json({ error: 'unauthorized' });
  next();
}

router.post('/admin/login', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && token === process.env.ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'unauthorized' });
});

export default router;
