// ─────────────────────────────────────────────────────────────────────────────
// Webhook routes — receive call-ended payloads from Bland AI.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { processCallWebhook } = require('../services/superAgentService');

const router = express.Router();

router.post('/bland/call-ended', async (req, res) => {
  try {
    const result = await processCallWebhook(req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[Webhook] call-ended error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
