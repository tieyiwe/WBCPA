// ─────────────────────────────────────────────────────────────────────────────
// Public client upload portal — token-gated, no auth required.
// Clients receive a /upload/<token> link from staff and can drop docs without
// logging in. Each upload lands in the tax-doc workflow tagged as a client
// portal upload so staff can see where it came from.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const svc = require('../services/taxDocService');

// GET /api/public/upload/:token — token validity + display metadata
router.get('/upload/:token', (req, res) => {
  const t = svc.validateUploadToken(req.params.token);
  if (!t) return res.status(404).json({ error: 'This upload link is invalid, expired, or has been revoked.' });
  // Don't echo the internal token back unnecessarily — client side already has it from URL
  res.json({
    client_name: t.client_name,
    client_email: t.client_email,
    message: t.message,
    expires_at: t.expires_at,
    accepted_types: ['W-2', '1099-NEC', '1099-K', '1099-MISC', 'K-1', '1040', 'Schedule-C', 'other']
  });
});

// POST /api/public/upload/:token — client drops one or more files
router.post('/upload/:token', (req, res) => {
  try {
    const { files } = req.body || {};
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: 'No files provided.' });
    }
    const result = svc.consumeUploadToken(req.params.token, files);
    res.json({
      ok: true,
      accepted: result.accepted,
      message: `Thanks — ${result.accepted} document${result.accepted === 1 ? '' : 's'} uploaded. Our team has been notified and will reach out shortly.`
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
