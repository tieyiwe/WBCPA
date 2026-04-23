// ─────────────────────────────────────────────────────────────────────────────
// Staff auth middleware — validates JWT issued by /api/auth/login.
// In MOCK_MODE (no JWT_SECRET set), every request is treated as a valid
// demo user so the dashboard works out of the box for previewing.
// ─────────────────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const MOCK_USER = { id: 'demo-user', email: 'demo@wbcpa.com', role: 'staff', name: 'Demo Staff' };

function authGuard(req, res, next) {
  if (!JWT_SECRET) {
    // Open preview mode — attach a demo user and proceed.
    req.user = MOCK_USER;
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { authGuard, MOCK_USER };
