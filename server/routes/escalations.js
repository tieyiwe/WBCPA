// ─────────────────────────────────────────────────────────────────────────────
// Escalations route — workers see what the AI flagged for human review,
// claim items (Accept), release them, or resolve them with notes.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const escSvc = require('../services/escalationService');
const { attachActor, requirePermission } = require('../middleware/currentActor');

const router = express.Router();

router.use(attachActor);

// Anyone with calls or emails view permission can see the queue.
router.get('/', (req, res) => {
  const { scope, status } = req.query;
  const items = escSvc.listEscalations({
    scope: scope || 'active',
    status,
    claimed_by_id: scope === 'mine' ? req.actor.id : undefined
  });
  res.json({
    items,
    summary: escSvc.summary({ actorId: req.actor.id })
  });
});

router.get('/summary', (req, res) => {
  res.json({ summary: escSvc.summary({ actorId: req.actor.id }) });
});

router.get('/:id', (req, res) => {
  const item = escSvc.getEscalation(req.params.id);
  if (!item) return res.status(404).json({ error: 'Escalation not found.' });
  res.json({ item });
});

// Workers (staff and above) can claim / accept escalations.
router.post('/:id/claim', requirePermission('emails.respond'), (req, res) => {
  try {
    const item = escSvc.claim(req.params.id, req.actor);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/release', requirePermission('emails.respond'), (req, res) => {
  try {
    const item = escSvc.release(req.params.id, req.actor);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/resolve', requirePermission('emails.respond'), (req, res) => {
  try {
    const item = escSvc.resolve(req.params.id, req.body || {}, req.actor);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Respond to the client (email or SMS), optionally resolving in the same step.
router.post('/:id/respond', requirePermission('emails.respond'), async (req, res) => {
  try {
    const result = await escSvc.respond(req.params.id, req.body || {}, req.actor);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
