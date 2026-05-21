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
const { processCallWebhook, recordCallStarted } = require('../services/superAgentService');
const escSvc = require('../services/escalationService');
const { guardInternal } = require('../middleware/internalKey');

const router = express.Router();

const BLAND_WEBHOOK_SECRET = process.env.BLAND_WEBHOOK_SECRET || null;
// Signature checking is OFF by default so a stray secret can never silently
// drop real Bland webhooks. Turn it on explicitly with BLAND_WEBHOOK_STRICT=true
// AND configure Bland to send Authorization: Bearer <BLAND_WEBHOOK_SECRET>.
const BLAND_WEBHOOK_STRICT = process.env.BLAND_WEBHOOK_STRICT === 'true';

// Log every inbound webhook hit so it's obvious in the deploy logs whether
// Bland is actually reaching us.
router.use((req, _res, next) => {
  console.log(`[Webhook] ${req.method} ${req.originalUrl} · from ${req.ip} · body keys: ${Object.keys(req.body || {}).join(',') || '(none)'}`);
  next();
});

function verifyBlandSignature(req) {
  if (!BLAND_WEBHOOK_SECRET || !BLAND_WEBHOOK_STRICT) return true; // accept by default
  const header = req.headers['authorization'] || req.headers['x-bland-signature'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const ok = token === BLAND_WEBHOOK_SECRET;
  if (!ok) console.warn('[Webhook] signature mismatch (strict mode on) — rejecting');
  return ok;
}

// Fires when a call is INITIATED — creates an "ongoing" record so the call
// shows live in the log immediately. Configure this as Bland's "call started"
// / dynamic-data webhook, or it's hit automatically for outbound dials.
router.post('/bland/call-started', (req, res) => {
  if (!verifyBlandSignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }
  try {
    const result = recordCallStarted(req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[Webhook] call-started error:', err.stack || err.message);
    return res.status(500).json({ error: err.message });
  }
});

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
      { user: 'agent', text: 'Thank you for calling The Wealth Building CPA. This is your WBCPA Command Center — how can I help?', created_at: new Date(Date.now() - 187000).toISOString() },
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

// ─── Real-time mid-call escalation ─────────────────────────────────────────
// The Bland agent invokes EscalateToHuman as a tool DURING the call when it
// hits something it can't handle (audit, upset caller, complex tax situation,
// explicit request for a human). The escalation lands in the queue
// immediately so workers see it before the call even ends.
// NOTE: not guarded by the internal key — a key mismatch must never silently
// drop an escalation. Creating a queue entry is low-risk.
router.post('/bland/escalate', async (req, res) => {
  try {
    const b = req.body || {};
    console.log('[Webhook] /bland/escalate hit · body keys:', Object.keys(b).join(',') || '(none)');
    const subject = b.subject || `Live call from ${b.client_name || 'caller'} — needs CPA`;
    const reason = b.reason || b.reason_flagged || 'AI agent escalated this call mid-conversation.';
    const urgency = (() => {
      const u = String(b.urgency || '').toLowerCase();
      if (['high', 'urgent', 'critical', 'p1'].includes(u)) return 'high';
      if (['low', 'p3'].includes(u)) return 'low';
      // Auto-detect from reason: audit/penalty/legal → high
      const r = `${reason} ${subject}`.toLowerCase();
      if (/audit|penalty|levy|lien|garnish|subpoena|notice|cp2000/.test(r)) return 'high';
      return 'medium';
    })();

    const item = escSvc.enqueue({
      type: 'call',
      call_log_id: b.call_log_id || null,
      client_name: b.client_name || 'Unknown Caller',
      client_phone: b.client_phone || b.from || null,
      client_email: b.client_email || null,
      subject,
      reason_flagged: reason,
      urgency,
      ai_handoff_summary: b.summary_so_far || b.ai_handoff_summary || reason
    });

    console.log(`[Webhook] Live escalation enqueued · id=${item.id} · urgency=${urgency} · client=${item.client_name}`);
    return res.json({
      ok: true,
      escalation_id: item.id,
      message: 'A CPA has been notified. They will follow up with you shortly.'
    });
  } catch (err) {
    console.error('[Webhook] /bland/escalate error:', err.stack || err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Test endpoint for the escalation flow — replays a realistic payload so the
// operator can confirm the queue + toast + chime light up without a real call.
router.post('/bland/escalate/test', async (req, res) => {
  const sample = {
    client_name: req.body?.client_name || 'James O\'Connor',
    client_phone: req.body?.client_phone || '+12025550105',
    client_email: req.body?.client_email || 'jim.oconnor@example.com',
    subject: req.body?.subject || 'IRS audit notice — caller needs CPA today',
    reason: req.body?.reason || 'Caller received a CP2000 notice from the IRS and is anxious. Wants to speak with Ebere directly.',
    urgency: req.body?.urgency || 'high',
    summary_so_far: req.body?.summary_so_far || 'Caller called about a CP2000 notice on their 2023 return. The notice proposes $14,200 in additional tax related to an unreported 1099-K from Stripe. They have not responded yet; deadline is in 38 days. Caller is upset and asked to speak with a human CPA immediately.'
  };
  try {
    const item = escSvc.enqueue({
      type: 'call',
      client_name: sample.client_name,
      client_phone: sample.client_phone,
      client_email: sample.client_email,
      subject: sample.subject,
      reason_flagged: sample.reason,
      urgency: sample.urgency,
      ai_handoff_summary: sample.summary_so_far
    });
    return res.json({
      ok: true,
      escalation_id: item.id,
      message: 'Test escalation enqueued. Watch the sidebar badge pulse and the toast in the corner.',
      item
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
