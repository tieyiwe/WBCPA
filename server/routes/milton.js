// ─────────────────────────────────────────────────────────────────────────────
// Milton AI Agent — chat endpoint
// POST /api/milton/chat   → { message } → { reply, mock, messages }
// DELETE /api/milton/chat → clear session
// GET /api/milton/session → get current session state
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { attachActor, requirePermission } = require('../middleware/currentActor');
const miltonSvc = require('../services/miltonAgentService');

router.use(attachActor);

// POST /api/milton/chat
router.post('/chat', requirePermission('milton.use'), async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required.' });
  }
  try {
    const result = await miltonSvc.chat(req.actor.id, req.actor, message.trim());
    res.json(result);
  } catch (err) {
    console.error('[Milton] chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/milton/chat — clear session history
router.delete('/chat', requirePermission('milton.use'), (req, res) => {
  const result = miltonSvc.clearSession(req.actor.id);
  res.json(result);
});

// GET /api/milton/session — retrieve current session messages
router.get('/session', requirePermission('milton.use'), (req, res) => {
  const session = miltonSvc.getSession(req.actor.id);
  res.json({ session });
});

module.exports = router;
