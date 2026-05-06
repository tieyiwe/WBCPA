// ─────────────────────────────────────────────────────────────────────────────
// Voice routes — agent stats, call log, deploy, SMS dispatch endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const {
  deployAgent,
  getAgentStats,
  getRecentCalls,
  sendSMS,
  buildToolSet,
  placeCallback,
  getConnectionStatus
} = require('../services/superAgentService');
const { buildPrompt } = require('../services/superAgentPrompt');
const { getCurrentSeason, getSeasonPromptTone } = require('../services/seasonService');
const { guardInternal } = require('../middleware/internalKey');
const { attachActor, requirePermission } = require('../middleware/currentActor');
const { MOCK_CALLS } = require('../services/mockData');
const { isConfigured, supabase } = require('../services/db');
const { logActivity } = require('../services/adminService');

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

// ─── Bland connection status (for the in-app connection panel) ─────────────
router.get('/connection', async (req, res) => {
  try {
    const status = getConnectionStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Single call detail (transcript + summary) ─────────────────────────────
router.get('/calls/:id', async (req, res) => {
  const { id } = req.params;
  if (!isConfigured()) {
    const call = MOCK_CALLS.find((c) => c.id === id || c.bland_call_id === id);
    if (!call) return res.status(404).json({ error: 'Call not found.' });
    return res.json({ call });
  }
  try {
    const { data, error } = await supabase
      .from('call_log')
      .select('*')
      .or(`id.eq.${id},bland_call_id.eq.${id}`)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Call not found.' });
    return res.json({ call: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Outbound callback — agent calls customer back ─────────────────────────
router.post('/calls/:id/callback', attachActor, requirePermission('emails.respond'), async (req, res) => {
  const { id } = req.params;
  const { topic, phone: phoneOverride } = req.body || {};

  let call = null;
  let phone = phoneOverride || null;
  let clientName = req.body?.clientName || null;
  let previousSummary = req.body?.previousSummary || null;

  if (!isConfigured()) {
    call = MOCK_CALLS.find((c) => c.id === id || c.bland_call_id === id);
  } else {
    try {
      const { data } = await supabase.from('call_log').select('*')
        .or(`id.eq.${id},bland_call_id.eq.${id}`).maybeSingle();
      call = data;
    } catch { /* ignore */ }
  }

  if (call) {
    phone = phone || call.caller_number;
    clientName = clientName || call.client_name;
    previousSummary = previousSummary || call.summary;
  }

  if (!phone) {
    return res.status(400).json({ error: 'No phone number available for this call.' });
  }

  try {
    const result = await placeCallback({
      phone,
      clientName,
      topic: topic || `Follow-up to your previous call regarding ${call?.topics_discussed?.[0] || 'your tax question'}.`,
      previousSummary,
      requestedBy: req.actor
    });

    if (result.ok) {
      logActivity({
        actor: req.actor,
        action: 'callback.requested',
        target_type: 'call',
        target_id: call?.id || id,
        target_label: clientName || phone,
        summary: result.mock
          ? `Mock callback queued for ${phone}`
          : `Outbound call queued (Bland call_id: ${result.call_id})`
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Outbound call to any phone (manual dial) ──────────────────────────────
router.post('/dial', attachActor, requirePermission('emails.respond'), async (req, res) => {
  const { phone, clientName, topic, previousSummary } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone is required.' });
  try {
    const result = await placeCallback({ phone, clientName, topic, previousSummary, requestedBy: req.actor });
    if (result.ok) {
      logActivity({
        actor: req.actor,
        action: 'callback.requested',
        target_type: 'call',
        target_id: null,
        target_label: clientName || phone,
        summary: result.mock ? `Mock outbound dial to ${phone}` : `Outbound dial to ${phone}`
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
