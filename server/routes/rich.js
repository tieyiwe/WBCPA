// ─────────────────────────────────────────────────────────────────────────────
// Rich AI Agent — chat endpoint
// POST /api/rich/chat   → { message } → { reply, mock, messages }
// DELETE /api/rich/chat → clear session
// GET /api/rich/session → get current session state
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { attachActor, requirePermission } = require('../middleware/currentActor');
const richSvc = require('../services/richAgentService');

router.use(attachActor);

// POST /api/rich/chat
router.post('/chat', requirePermission('rich.use'), async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required.' });
  }
  try {
    const result = await richSvc.chat(req.actor.id, req.actor, message.trim());
    res.json(result);
  } catch (err) {
    console.error('[Rich] chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rich/chat — clear session history
router.delete('/chat', requirePermission('rich.use'), (req, res) => {
  const result = richSvc.clearSession(req.actor.id);
  res.json(result);
});

// GET /api/rich/session — retrieve current session messages
router.get('/session', requirePermission('rich.use'), (req, res) => {
  const session = richSvc.getSession(req.actor.id);
  res.json({ session });
});

module.exports = router;
