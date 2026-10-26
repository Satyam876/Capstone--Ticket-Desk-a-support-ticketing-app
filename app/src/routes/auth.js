const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signAccess, issueRefresh } = require('../auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['customer', 'agent', 'admin'];

router.post('/register', (req, res) => {
  const { email, password, role } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Valid email required' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // Testability hook: role can be chosen only outside production.
  let finalRole = 'customer';
  if (role !== undefined) {
    if (process.env.NODE_ENV === 'production')
      return res.status(403).json({ error: 'Cannot set role' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    finalRole = role;
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Email already registered' });

  const info = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?,?,?)')
    .run(email, bcrypt.hashSync(password, 8), finalRole);
  res.status(201).json({ id: info.lastInsertRowid, email, role: finalRole });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = typeof email === 'string' && db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({
    accessToken: signAccess(user),
    refreshToken: issueRefresh(user.id),
    user: { id: user.id, email: user.email, role: user.role },
  });
});

// Refresh tokens rotate: each token is single-use.
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  const row = typeof refreshToken === 'string' &&
    db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(refreshToken);
  if (!row || row.revoked || row.expires_at < Date.now())
    return res.status(401).json({ error: 'Invalid refresh token' });
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').run(refreshToken);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  res.json({ accessToken: signAccess(user), refreshToken: issueRefresh(user.id) });
});

module.exports = router;
