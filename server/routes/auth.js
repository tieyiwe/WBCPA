// ─────────────────────────────────────────────────────────────────────────────
// Auth routes — /api/auth/login, /logout, /me
// Uses Supabase Auth if configured, otherwise accepts any credentials and
// returns a mock session so previewing the app works without env vars.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const jwt = require('jsonwebtoken');
const { supabase, isConfigured } = require('../services/db');
const { authGuard } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || null;

function issueToken(payload) {
  if (!JWT_SECRET) return 'mock-dev-token';
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required.' });

  // Mock mode — accept any non-empty credentials
  if (!isConfigured() || !JWT_SECRET) {
    const user = { id: 'demo-user', email, name: 'Demo Staff', role: 'staff' };
    return res.json({
      token: issueToken(user),
      user,
      mock: true
    });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    const user = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || data.user.email,
      role: 'staff'
    };
    return res.json({ token: issueToken(user), user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  return res.json({ ok: true });
});

router.get('/me', authGuard, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
