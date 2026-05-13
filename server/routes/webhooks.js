// ─────────────────────────────────────────────────────────────────────────────
// Webhook routes — receive call-ended payloads from Bland AI.
//
// Bland POSTs to /api/webhooks/bland/call-ended when a call ends. The handler
// normalizes the payload, persists the call (with structured transcript) to
// Supabase if configured (otherwise MOCK_CALLS), and auto-enqueues an
// escalation if the call was transferred or flagged.
//
// Configure on the Bland side by setting the webhook URL on the agent to:
//   <REPLIT_URL>/api/webhooks/bland/call-ended
// You can verify it's working without a real call by hitting the
// `/test` endpoint below — it replays a sample payload through the same code path.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { processCallWebhook } = require('../services/superAgentService');

const router = express.Router();

const BLAND_WEBHOOK_SECRET = process.env.BLAND_WEBHOOK_SECRET || null;

// Optional shared-secret check — set BLAND_WEBHOOK_SECRET in Replit Secrets
// AND configure the same value in Bland's webhook settings to enable.
function verifyBlandSignature(req) {
  if (!BLAND_WEBHOOK_SECRET) return true; // disabled when no secret configured
  const header = req.headers['authorization'] || req.headers['x-bland-signature'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  return token === BLAND_WEBHOOK_SECRET;
}

router.post('/bland/call-ended', async (req, res) => {
  if (!verifyBlandSignature(req)) {
    console.warn('[Webhook] bland/call-ended: signature mismatch — rejecting');
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }
  try {
    const result = await processCallWebhook(req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[Webhook] call-ended error:', err.stack || err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Replay a realistic sample payload so the operator can confirm transcripts
// are being captured end-to-end without placing a real call.
// Hit: POST /api/webhooks/bland/call-ended/test
router.post('/bland/call-ended/test', async (req, res) => {
  const samplePayload = {
    call_id: `bl_test_${Date.now().toString(36)}`,
    from: req.body?.from || '+12025550199',
    to: req.body?.to || '+18885025672',
    call_length: req.body?.duration || 187,
    duration: req.body?.duration || 187,
    transferred: req.body?.transferred ?? false,
    direction: 'inbound',
    summary: req.body?.summary || 'Test call received via the webhook test endpoint. Caller asked about an S-Corp election and was given a high-level breakdown of payroll-tax savings at $240k SE income. Booking offered.',
    recording_url: 'https://mock.bland.ai/recording/test-call.mp3',
    transcripts: [
      { user: 'agent', text: 'Thank you for calling The Wealth Building CPA. This is the Super Agent — how can I help?', created_at: new Date(Date.now() - 187000).toISOString() },
      { user: 'user', text: 'Hi, I had a question about doing an S-Corp election.', created_at: new Date(Date.now() - 180000).toISOString() },
      { user: 'agent', text: 'Happy to walk through that. What is your projected self-employment net income for the year?', created_at: new Date(Date.now() - 174000).toISOString() },
      { user: 'user', text: 'Around 240 thousand.', created_at: new Date(Date.now() - 168000).toISOString() },
      { user: 'agent', text: 'At that level the S-Corp election typically saves roughly 10 to 18 thousand a year on self-employment tax. Want me to book a 30-minute consultation with one of our CPAs to run the exact numbers?', created_at: new Date(Date.now() - 160000).toISOString() },
      { user: 'user', text: 'Yes please, Thursday at 11 works.', created_at: new Date(Date.now() - 150000).toISOString() },
      { user: 'agent', text: 'Booked. You will get a text confirmation with the Google Meet link in a moment.', created_at: new Date(Date.now() - 142000).toISOString() }
    ],
    variables: {
      client_name: req.body?.client_name || 'Sarah Chen',
      topics: ['S-Corp election', 'Self-employment tax', 'Payroll tax savings'],
      booking_made: true,
      appointment_details: 'S-Corp consultation — Thursday 11am ET'
    }
  };

  try {
    const result = await processCallWebhook(samplePayload);
    return res.json({
      ok: true,
      message: 'Test webhook processed. Open /dashboard/calls to see the new entry; if transferred/action-needed, also check /dashboard/escalations.',
      processed: result,
      payload_sent: samplePayload
    });
  } catch (err) {
    console.error('[Webhook] test error:', err.stack || err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
