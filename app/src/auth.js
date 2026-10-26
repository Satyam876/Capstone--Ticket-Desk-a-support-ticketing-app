const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./db');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, SECRET(), {
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  });
}

function issueRefresh(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
  db.prepare('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?,?,?)')
    .run(token, userId, Date.now() + days * 86400000);
  return token;
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const p = jwt.verify(token, SECRET());
    req.user = { id: p.sub, role: p.role, email: p.email };
    next();
  } catch (e) {
    const msg = e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

module.exports = { signAccess, issueRefresh, authenticate, requireRole };
