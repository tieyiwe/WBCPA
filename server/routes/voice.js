// ─────────────────────────────────────────────────────────────────────────────
// Voice routes — agent stats, call log, deploy, SMS dispatch endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const {
  deployAgent,
  getAgentStats,
  getRecentCalls,
  sendSMS,
  buildToolSet
} = require('../services/superAgentService');
const { buildPrompt } = require('../services/superAgentPrompt');
const { getCurrentSeason, getSeasonPromptTone } = require('../services/seasonService');
const { guardInternal } = require('../middleware/internalKey');

const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const stats = await getAgentStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/calls', async (req, res) => {
  const { filter } = req.query;
  try {
    const calls = await getRecentCalls(filter, 100);
    return res.json({ calls });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/deploy-agent', async (req, res) => {
  try {
    const result = await deployAgent();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/prompt', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    const prompt = buildPrompt(getSeasonPromptTone(season));
    const tools = buildToolSet();
    return res.json({ season, prompt, tools });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Bland AI SMS callback ───────────────────────────────────────────────────
router.post('/sms', guardInternal, async (req, res) => {
  const { to, summary, appointment_details } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Missing to.' });
  const result = await sendSMS(to, summary, appointment_details);
  return res.json(result);
});

module.exports = router;
