// ─────────────────────────────────────────────────────────────────────────────
// Super Agent Service — Bland AI voice agent orchestration
// deploy, verify subscriber, SMS, webhook ingest, stats.
// All external calls wrapped in try/catch with mock fallbacks.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const { buildPrompt } = require('./superAgentPrompt');
const { getCurrentSeason, getSeasonPromptTone } = require('./seasonService');
const { supabase, isConfigured } = require('./db');
const { MOCK_SUBSCRIBERS, MOCK_CALLS } = require('./mockData');

const BLAND_API_KEY = process.env.BLAND_API_KEY;
const BLAND_AGENT_ID = process.env.BLAND_AGENT_ID;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'dev-internal-key';
const REPLIT_URL = process.env.REPLIT_URL || 'http://localhost:3000';
const WBCPA_STAFF_PHONE = process.env.WBCPA_STAFF_PHONE || '+12025559999';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn('[SuperAgent] Twilio client init failed:', err.message);
  }
}

function buildToolSet() {
  const internalHeader = { 'x-api-key': INTERNAL_API_KEY };
  return [
    { name: 'end_call' },
    { name: 'transfer_call', transfer_phone_number: WBCPA_STAFF_PHONE },
    {
      name: 'CheckAvailability',
      description: 'Fetch open 30-min consultation slots for the next 5 business days.',
      url: `${REPLIT_URL}/api/calendar/availability`,
      method: 'POST',
      headers: internalHeader,
      body: { daysAhead: 5 },
      response: { available: 'boolean', spokenOptions: 'string', slots: 'array' }
    },
    {
      name: 'BookAppointment',
      description: 'Book a consultation once the client has picked a slot.',
      url: `${REPLIT_URL}/api/calendar/book`,
      method: 'POST',
      headers: internalHeader,
      body: {
        clientName: '{{client_name}}',
        clientEmail: '{{client_email}}',
        clientPhone: '{{from}}',
        preferredTime: '{{preferred_time}}',
        slotIndex: '{{slot_index}}',
        topic: '{{topic}}',
        notes: '{{notes}}'
      },
      response: { success: 'boolean', displayTime: 'string', meetLink: 'string', message: 'string' }
    },
    {
      name: 'VerifySubscriber',
      description: 'Verify the caller is an existing WBCPA customer and pull their profile + recent call history. Call this at the start of every call with the caller phone number. Returns name, first_name, tier, status, notes, call_count, last_call, recent_calls, and history_summary so you can greet them by name and reference past conversations.',
      url: `${REPLIT_URL}/api/subscribers/verify`,
      method: 'POST',
      headers: internalHeader,
      body: { phone: '{{from}}', email: '{{email}}' },
      response: { verified: 'boolean', name: 'string', first_name: 'string', tier: 'string', notes: 'string', call_count: 'number', history_summary: 'string', message: 'string' }
    },
    {
      name: 'CustomerLookup',
      description: 'Pull an existing customer\'s fuller profile (notes, tier, status, recent call summaries) mid-call by phone or email. Use when you need more detail than VerifySubscriber returned.',
      url: `${REPLIT_URL}/api/subscribers/lookup`,
      method: 'POST',
      headers: internalHeader,
      body: { phone: '{{from}}', email: '{{email}}' },
      response: { found: 'boolean', subscriber: 'object', recent_calls: 'array' }
    },
    {
      name: 'SendSMSSummary',
      description: 'Text the caller an SMS recap of the call with any appointment details.',
      url: `${REPLIT_URL}/api/voice/sms`,
      method: 'POST',
      headers: internalHeader,
      body: {
        to: '{{from}}',
        summary: '{{call_summary}}',
        appointment_details: '{{appointment_details}}'
      },
      response: { sent: 'boolean' }
    },
    {
      name: 'EscalateToHuman',
      description: "Flag this call for a human worker to follow up. Call this WHILE the call is still in progress whenever the caller (1) mentions an IRS notice, audit, penalty, levy, lien, or wage garnishment, (2) is upset or frustrated, (3) asks an investment / legal / billing question you cannot confidently answer, (4) explicitly asks to speak with Ebere or a human CPA, or (5) describes a complex multi-entity / estate / inheritance situation. After calling this tool, briefly tell the caller a CPA will follow up shortly and offer to take a message or transfer.",
      url: `${REPLIT_URL}/api/webhooks/bland/escalate`,
      method: 'POST',
      headers: internalHeader,
      body: {
        client_name: '{{client_name}}',
        client_phone: '{{from}}',
        client_email: '{{email}}',
        subject: '{{escalation_subject}}',
        reason: '{{escalation_reason}}',
        urgency: '{{escalation_urgency}}',
        summary_so_far: '{{call_summary}}'
      },
      response: { ok: 'boolean', escalation_id: 'string', message: 'string' }
    }
  ];
}

async function deployAgent() {
  if (!BLAND_API_KEY) {
    console.log('[SuperAgent] BLAND_API_KEY not set — deployAgent skipped (MOCK_MODE).');
    return { ok: false, mock: true, message: 'Bland AI not configured — add BLAND_API_KEY to Replit Secrets to deploy.' };
  }

  const season = await getCurrentSeason();
  const promptBody = buildPrompt(getSeasonPromptTone(season));
  const tools = buildToolSet();

  const agentPayload = {
    prompt: promptBody,
    voice: 'june',
    language: 'en-US',
    max_duration: 45,
    temperature: 0.4,
    record: true,
    transfer_phone_number: WBCPA_STAFF_PHONE,
    webhook: `${REPLIT_URL}/api/webhooks/bland/call-ended`,
    tools
  };

  try {
    const url = BLAND_AGENT_ID
      ? `https://api.bland.ai/v1/agents/${BLAND_AGENT_ID}`
      : 'https://api.bland.ai/v1/agents';

    const method = BLAND_AGENT_ID ? 'POST' : 'POST';

    const response = await axios({
      url,
      method,
      headers: {
        'Authorization': BLAND_API_KEY,
        'Content-Type': 'application/json'
      },
      data: agentPayload,
      timeout: 20000
    });

    return { ok: true, agent_id: response.data?.agent_id || BLAND_AGENT_ID, season };
  } catch (err) {
    console.warn('[SuperAgent] deployAgent failed:', err.message);
    return { ok: false, error: err.message, mock: true };
  }
}

// Normalize a phone to just digits so +1 202… and 202… and (202) … all match.
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function phonesMatch(a, b) {
  const da = digits(a), db = digits(b);
  if (!da || !db) return false;
  return da === db || da.slice(-10) === db.slice(-10); // last-10 handles country code
}

// Pull recent call context for a subscriber so the agent can reference history.
function recentCallContext(subscriberId) {
  const calls = (MOCK_CALLS || [])
    .filter((c) => c.subscriber_id === subscriberId)
    .sort((a, b) => new Date(b.called_at || 0) - new Date(a.called_at || 0))
    .slice(0, 3);
  return calls.map((c) => ({
    when: c.called_at,
    summary: c.summary,
    topics: c.topics_discussed || []
  }));
}

async function verifySubscriber(phone, email) {
  if (!isConfigured()) {
    // Match by phone (digits) or email — NO random fallback. Unknown caller = not verified.
    const matched = MOCK_SUBSCRIBERS.find(
      (s) => (phone && phonesMatch(s.phone, phone)) || (email && s.email && s.email.toLowerCase() === String(email).toLowerCase())
    );
    if (!matched) return { verified: false, subscriber: null, tier: null };
    const active = matched.status === 'active' && (!matched.expires_at || new Date(matched.expires_at) > new Date());
    return {
      verified: active,
      subscriber: matched,
      tier: matched.tier,
      recent_calls: recentCallContext(matched.id)
    };
  }

  try {
    let query = supabase.from('subscribers').select('*');
    if (phone && email) {
      query = query.or(`phone.eq.${phone},email.eq.${email}`);
    } else if (phone) {
      query = query.eq('phone', phone);
    } else if (email) {
      query = query.eq('email', email);
    } else {
      return { verified: false, subscriber: null, tier: null };
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;
    const sub = data?.[0];
    if (!sub) return { verified: false, subscriber: null, tier: null };

    const active = sub.status === 'active' && (!sub.expires_at || new Date(sub.expires_at) > new Date());
    return { verified: active, subscriber: sub, tier: sub.tier, recent_calls: [] };
  } catch (err) {
    console.warn('[SuperAgent] verifySubscriber DB failed:', err.message);
    // On DB error, don't fabricate a customer — report not-verified so the
    // agent treats them as a prospect rather than leaking someone else's data.
    return { verified: false, subscriber: null, tier: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbound callback — Bland places a call back to a customer using the deployed
// agent. The agent picks up where the previous call left off using the
// `previous_summary` and `topic` task variables.
// ─────────────────────────────────────────────────────────────────────────────
async function placeCallback({ phone, clientName, topic, previousSummary, requestedBy }) {
  if (!phone) {
    return { ok: false, error: 'Phone number is required to call back.' };
  }
  if (!BLAND_API_KEY) {
    console.log(`[SuperAgent MOCK] would call back ${phone} re: "${(topic || '').slice(0, 60)}" requested by ${requestedBy?.name || 'staff'}`);
    return {
      ok: true,
      mock: true,
      message: `Mock: would dial ${phone} now. Add BLAND_API_KEY to make this live.`,
      phone,
      topic
    };
  }

  const season = await getCurrentSeason();
  const taskBriefing = [
    `You are calling ${clientName || 'the client'} back at the request of WBCPA staff (${requestedBy?.name || 'staff member'}).`,
    topic ? `The reason for the callback: ${topic}.` : null,
    previousSummary ? `Previous call summary you should reference: ${previousSummary}` : null,
    'Open warmly: identify yourself as the WBCPA Command Center calling them back. Confirm it is a good time. Use your existing tools (CheckAvailability, BookAppointment, SendSMSSummary) as needed.'
  ].filter(Boolean).join(' ');

  try {
    const payload = {
      phone_number: phone,
      task: taskBriefing,
      voice: 'june',
      record: true,
      max_duration: 12,
      webhook: `${REPLIT_URL}/api/webhooks/bland/call-ended`,
      metadata: {
        outbound: true,
        requested_by_id: requestedBy?.id,
        requested_by_name: requestedBy?.name,
        topic,
        season
      },
      ...(BLAND_AGENT_ID ? { agent_id: BLAND_AGENT_ID } : {}),
      tools: buildToolSet()
    };

    const response = await axios({
      url: 'https://api.bland.ai/v1/calls',
      method: 'POST',
      headers: {
        'Authorization': BLAND_API_KEY,
        'Content-Type': 'application/json'
      },
      data: payload,
      timeout: 15000
    });

    const callId = response.data?.call_id || response.data?.id;
    // Show the outbound call live in the log immediately as "ongoing".
    if (callId) {
      recordCallStarted({ call_id: callId, to: phone, from: phone, direction: 'outbound', client_name: clientName });
    }

    return {
      ok: true,
      call_id: callId,
      status: response.data?.status || 'queued',
      phone,
      topic
    };
  } catch (err) {
    console.warn('[SuperAgent] placeCallback failed:', err.message);
    return { ok: false, error: err.response?.data?.error || err.message };
  }
}

function getConnectionStatus() {
  const baseUrl = REPLIT_URL || 'http://localhost:3000';
  return {
    bland: {
      configured: Boolean(BLAND_API_KEY),
      agent_id: BLAND_AGENT_ID || null,
      agent_id_set: Boolean(BLAND_AGENT_ID)
    },
    twilio: {
      configured: Boolean(twilioClient && TWILIO_PHONE_NUMBER),
      phone_number: TWILIO_PHONE_NUMBER || null
    },
    webhooks: {
      call_ended: `${baseUrl}/api/webhooks/bland/call-ended`,
      call_ended_test: `${baseUrl}/api/webhooks/bland/call-ended/test`,
      verify_subscriber: `${baseUrl}/api/subscribers/verify`,
      check_availability: `${baseUrl}/api/calendar/availability`,
      book_appointment: `${baseUrl}/api/calendar/book`,
      send_sms: `${baseUrl}/api/voice/sms`,
      signature_required: Boolean(process.env.BLAND_WEBHOOK_SECRET)
    },
    staff: {
      transfer_phone: WBCPA_STAFF_PHONE
    },
    base_url: baseUrl,
    base_url_is_localhost: !REPLIT_URL || REPLIT_URL.includes('localhost'),
    requires_internal_key: Boolean(INTERNAL_API_KEY && INTERNAL_API_KEY !== 'dev-internal-key'),
    internal_key_header: 'x-api-key'
  };
}

async function sendSMS(to, summary, appointmentDetails) {
  if (!twilioClient || !TWILIO_PHONE_NUMBER) {
    console.log(`[SMS MOCK] to=${to} summary="${(summary || '').slice(0, 80)}..." apt=${appointmentDetails || 'none'}`);
    return { sent: false, mock: true };
  }

  const body = [
    'WBCPA Command Center — call recap:',
    '',
    summary || 'Thanks for calling WBCPA.',
    appointmentDetails ? `\nAppointment: ${appointmentDetails}` : '',
    '\n— Reply STOP to opt out.'
  ].join('\n');

  try {
    await twilioClient.messages.create({
      to,
      from: TWILIO_PHONE_NUMBER,
      body
    });
    return { sent: true };
  } catch (err) {
    console.warn('[SuperAgent] sendSMS failed:', err.message);
    return { sent: false, error: err.message };
  }
}

function detectActionNeeded(summary) {
  if (!summary) return false;
  const flags = ['audit', 'irs', 'penalty', 'amended', 'legal', 'subpoena', 'notice'];
  const s = summary.toLowerCase();
  return flags.some((f) => s.includes(f));
}

// ─── Transcript normalization ─────────────────────────────────────────────
// Bland sends transcripts in a few shapes depending on the integration config:
//
//   1. `transcripts`: array of { user, text, created_at } — most common
//   2. `transcripts`: array of { role, content, timestamp }
//   3. `transcript`: single string with "Agent: ...\nUser: ..." lines
//   4. `concatenated_transcript`: single string
//
// The UI expects [{ role: 'agent'|'caller', at: 'M:SS', text }]. Normalize
// every variant into that shape so the CallItem viewer renders correctly.

function normalizeRole(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'agent' || s === 'assistant' || s === 'ai' || s === 'bot') return 'agent';
  if (s === 'user' || s === 'caller' || s === 'human' || s === 'customer') return 'caller';
  return s || 'agent';
}

function formatTimestamp(seconds) {
  if (seconds == null || isNaN(seconds)) return '';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function normalizeTranscript(payload) {
  // Shape 1/2: structured array
  const arr = payload.transcripts || payload.transcript_segments || null;
  if (Array.isArray(arr) && arr.length) {
    const callStart = arr[0]?.created_at || arr[0]?.timestamp || null;
    const startMs = callStart ? new Date(callStart).getTime() : null;
    return arr.map((row) => {
      const role = normalizeRole(row.user || row.role || row.speaker);
      const text = (row.text || row.content || row.transcript || '').trim();
      let at = '';
      if (row.created_at && startMs) {
        at = formatTimestamp((new Date(row.created_at).getTime() - startMs) / 1000);
      } else if (row.timestamp && startMs) {
        at = formatTimestamp((new Date(row.timestamp).getTime() - startMs) / 1000);
      } else if (typeof row.offset === 'number') {
        at = formatTimestamp(row.offset);
      } else if (typeof row.start === 'number') {
        at = formatTimestamp(row.start);
      }
      return { role, at, text };
    }).filter((row) => row.text);
  }

  // Shape 3/4: single concatenated string. Parse "Agent: ...\nUser: ..." lines.
  const raw = payload.concatenated_transcript || (typeof payload.transcript === 'string' ? payload.transcript : null);
  if (raw) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const segments = [];
    for (const line of lines) {
      const m = line.match(/^(agent|assistant|ai|bot|user|caller|human|customer)\s*[:\-]\s*(.+)$/i);
      if (m) {
        segments.push({ role: normalizeRole(m[1]), at: '', text: m[2].trim() });
      } else if (segments.length) {
        // Continuation of previous speaker's line
        segments[segments.length - 1].text += ' ' + line;
      }
    }
    if (segments.length) return segments;
  }

  return null;
}

function extractTopics(payload) {
  if (Array.isArray(payload.variables?.topics)) return payload.variables.topics;
  if (Array.isArray(payload.topics)) return payload.topics;
  if (typeof payload.variables?.topics === 'string') {
    return payload.variables.topics.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  }
  // Heuristic: pull obvious tax keywords from the summary
  const summary = String(payload.summary || '').toLowerCase();
  const keywords = ['s-corp', 's corp', '1031', 'qbi', 'roth', 'sep-ira', 'cp2000', 'audit', '1099', 'w-2', 'k-1', 'schedule c', 'depreciation', '199a', 'estimated tax', 'home office'];
  const hits = keywords.filter((k) => summary.includes(k));
  return hits.length ? hits.map((k) => k.toUpperCase().includes('199A') ? 'QBI deduction §199A' : k.replace(/\b\w/g, (c) => c.toUpperCase())) : null;
}

// Upsert a call into MOCK_CALLS by bland_call_id. Updates an existing record
// (e.g. an "ongoing" one created at call start) or prepends a new one.
function upsertMockCall(blandCallId, patch) {
  const existing = MOCK_CALLS.find((c) => c.bland_call_id === blandCallId);
  if (existing) {
    Object.assign(existing, patch);
    return existing.id;
  }
  const row = { id: `call_${Date.now()}`, ...patch };
  MOCK_CALLS.unshift(row);
  return row.id;
}

// Called when a call is INITIATED (inbound answered or outbound dialed).
// Creates an "ongoing" record immediately so it shows live in the Call Log,
// then processCallWebhook fills in the details when the call ends.
function recordCallStarted(payload = {}) {
  const call_id = payload.call_id || payload.c_id || `bl_${Date.now()}`;
  const callerPhone = payload.from || payload.phone_number || payload.to || null;
  const direction = payload.direction || (payload.outbound ? 'outbound' : 'inbound');
  const clientName = payload.client_name || payload.variables?.client_name || payload.variables?.name
    || (callerPhone ? (MOCK_SUBSCRIBERS.find((s) => s.phone === callerPhone)?.name) : null)
    || 'Incoming caller';

  const record = {
    bland_call_id: call_id,
    caller_number: callerPhone,
    subscriber_id: callerPhone ? (MOCK_SUBSCRIBERS.find((s) => s.phone === callerPhone)?.id || null) : null,
    client_name: clientName,
    direction,
    duration_seconds: 0,
    transcript: null,
    summary: 'Call in progress…',
    topics_discussed: null,
    action_needed: false,
    booking_made: false,
    transferred: false,
    recording_url: null,
    status: 'ongoing',
    sms_sent: false,
    called_at: new Date().toISOString()
  };

  if (isConfigured()) {
    supabase.from('call_log').upsert(record, { onConflict: 'bland_call_id' })
      .then(() => {}).catch((e) => console.warn('[SuperAgent] call-started upsert failed:', e.message));
  }
  const id = upsertMockCall(call_id, record);
  console.log(`[SuperAgent] Call STARTED · ${direction} · ${clientName} · ${callerPhone || 'no number'} · id=${id}`);
  return { ok: true, id, bland_call_id: call_id, status: 'ongoing' };
}

async function processCallWebhook(payload = {}) {
  // Log a compact summary so the operator can confirm webhooks are landing.
  console.log('[Webhook] call-ended received:', {
    call_id: payload.call_id || payload.c_id,
    from: payload.from || payload.phone_number,
    to: payload.to,
    duration: payload.call_length || payload.duration,
    transferred: payload.transferred,
    has_transcripts: Array.isArray(payload.transcripts) ? payload.transcripts.length : Boolean(payload.transcript)
  });

  const call_id = payload.call_id || payload.c_id || `bl_${Date.now()}`;
  const callerPhone = payload.from || payload.phone_number || payload.variables?.from;
  const duration = Number(payload.call_length || payload.duration || 0);
  let summary = payload.summary || payload.call_summary || null;
  const recording_url = payload.recording_url || payload.recording || null;
  const transferred = Boolean(payload.transferred || payload.transfer);
  const variables = payload.variables || {};
  const clientName = variables.client_name || variables.name || payload.client_name || 'Unknown Caller';
  const appointmentDetails = variables.appointment_details || payload.appointment_details || null;
  const direction = payload.direction || (payload.outbound ? 'outbound' : 'inbound');

  let transcript = normalizeTranscript(payload);

  // Translate to English if the caller spoke another language (Spanish, French, etc.)
  let transcriptLanguage = 'en';
  let transcriptTranslated = false;
  if (transcript && transcript.length) {
    try {
      const { translateCall } = require('./translationService');
      const t = await translateCall({ segments: transcript, summary });
      if (t.was_translated) {
        transcript = t.segments;       // English text, with original_text preserved per segment
        summary = t.summary;           // English summary
        transcriptLanguage = t.source_language;
        transcriptTranslated = true;
        console.log(`[SuperAgent] Transcript translated from ${t.source_language_name} → English`);
      }
    } catch (err) {
      console.warn('[SuperAgent] translation step failed:', err.message);
    }
  }

  const topics = extractTopics(payload);
  const actionNeeded = detectActionNeeded(summary) || transferred;

  // Build an AI handoff summary for the escalation queue when the call was
  // transferred or flagged. This is what shows up on the Escalations card.
  let aiHandoffSummary = null;
  if (transferred || actionNeeded) {
    aiHandoffSummary = summary
      ? `${summary}${transferred ? ' [Call was transferred to staff.]' : ''}`
      : `Call from ${clientName} (${callerPhone || 'unknown phone'}) was ${transferred ? 'transferred to staff' : 'flagged for review'}. ${duration}s duration.`;
  }

  // Look up matching subscriber by phone
  let subscriberId = null;
  if (isConfigured() && callerPhone) {
    try {
      const { data } = await supabase
        .from('subscribers')
        .select('id, name')
        .eq('phone', callerPhone)
        .maybeSingle();
      subscriberId = data?.id || null;
    } catch (err) {
      console.warn('[SuperAgent] subscriber lookup failed:', err.message);
    }
  } else if (callerPhone) {
    const match = MOCK_SUBSCRIBERS.find((s) => s.phone === callerPhone);
    subscriberId = match?.id || null;
  }

  const callRecord = {
    bland_call_id: call_id,
    caller_number: callerPhone,
    subscriber_id: subscriberId,
    client_name: clientName,
    direction,
    duration_seconds: duration,
    transcript,
    summary,
    transcript_language: transcriptLanguage,
    transcript_translated: transcriptTranslated,
    topics_discussed: topics,
    action_needed: actionNeeded,
    booking_made: Boolean(variables.booking_made || payload.booking_made),
    transferred,
    recording_url,
    appointment_details: appointmentDetails,
    ai_handoff_summary: aiHandoffSummary,
    status: 'completed',
    sms_sent: false,
    ended_at: new Date().toISOString()
  };

  let savedCallId = null;
  if (isConfigured()) {
    try {
      const { data } = await supabase
        .from('call_log')
        .upsert(callRecord, { onConflict: 'bland_call_id' })
        .select('id')
        .single();
      savedCallId = data?.id || null;
      console.log(`[SuperAgent] call_log upsert OK · bland_call_id=${call_id} · row=${savedCallId}`);
    } catch (err) {
      console.warn('[SuperAgent] call_log upsert failed, falling back to MOCK_CALLS:', err.message);
      savedCallId = upsertMockCall(call_id, callRecord);
    }
  } else {
    // Update the existing "ongoing" record if one was created at call start,
    // otherwise create a fresh completed record.
    savedCallId = upsertMockCall(call_id, callRecord);
    console.log(`[SuperAgent] MOCK_CALLS saved · id=${savedCallId} · bland_call_id=${call_id} · transcript_segments=${transcript?.length || 0}`);
  }

  // Auto-enqueue an escalation for transferred / action-needed calls so
  // staff sees them in the Escalations tab without a manual step.
  if (aiHandoffSummary) {
    try {
      const escSvc = require('./escalationService');
      const subject = transferred
        ? `Transferred call from ${clientName}`
        : `Action needed: ${(topics && topics[0]) || 'follow-up required'}`;
      escSvc.enqueue({
        type: 'call',
        call_log_id: savedCallId,
        client_name: clientName,
        client_phone: callerPhone,
        client_email: null,
        subject,
        reason_flagged: transferred ? 'AI transferred the call to staff' : 'AI flagged this call for human review',
        urgency: detectActionNeeded(summary) ? 'high' : 'medium',
        ai_handoff_summary: aiHandoffSummary
      });
      console.log(`[SuperAgent] Escalation enqueued for call ${savedCallId}`);
    } catch (err) {
      console.warn('[SuperAgent] escalation enqueue failed:', err.message);
    }
  }

  // SMS recap for substantive calls
  if (duration > 120 && summary && callerPhone) {
    try {
      await sendSMS(callerPhone, summary, appointmentDetails);
      callRecord.sms_sent = true;
    } catch (err) {
      console.warn('[SuperAgent] SMS recap failed:', err.message);
    }
  }

  return {
    ok: true,
    call_id: savedCallId,
    bland_call_id: call_id,
    action_needed: actionNeeded,
    transferred,
    transcript_segments: transcript?.length || 0,
    escalation_enqueued: Boolean(aiHandoffSummary)
  };
}

async function getAgentStats() {
  const agentName = 'WBCPA Command Center';
  const online = Boolean(BLAND_API_KEY);

  if (!isConfigured()) {
    const calls = MOCK_CALLS;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const today = calls.filter((c) => new Date(c.called_at) >= todayStart);
    const month = calls.filter((c) => new Date(c.called_at) >= monthStart);

    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + (b.duration_seconds || 0), 0) / arr.length) : 0;

    return {
      agent: { online, name: agentName, mock: true },
      today: {
        calls: today.length,
        bookings: today.filter((c) => c.booking_made).length,
        transferred: today.filter((c) => c.transferred).length,
        avgDuration: avg(today)
      },
      month: {
        calls: month.length,
        bookings: month.filter((c) => c.booking_made).length,
        transferred: month.filter((c) => c.transferred).length,
        avgDuration: avg(month)
      }
    };
  }

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: todayRows = [] }, { data: monthRows = [] }] = await Promise.all([
      supabase.from('call_log').select('*').gte('called_at', todayStart.toISOString()),
      supabase.from('call_log').select('*').gte('called_at', monthStart.toISOString())
    ]);

    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + (b.duration_seconds || 0), 0) / arr.length) : 0;

    return {
      agent: { online, name: agentName },
      today: {
        calls: todayRows.length,
        bookings: todayRows.filter((c) => c.booking_made).length,
        transferred: todayRows.filter((c) => c.transferred).length,
        avgDuration: avg(todayRows)
      },
      month: {
        calls: monthRows.length,
        bookings: monthRows.filter((c) => c.booking_made).length,
        transferred: monthRows.filter((c) => c.transferred).length,
        avgDuration: avg(monthRows)
      }
    };
  } catch (err) {
    console.warn('[SuperAgent] getAgentStats failed:', err.message);
    return { agent: { online: false, name: agentName, error: err.message }, today: {}, month: {} };
  }
}

async function getRecentCalls(filter, limit = 50) {
  if (!isConfigured()) {
    let list = [...MOCK_CALLS];
    if (filter === 'bookings') list = list.filter((c) => c.booking_made);
    if (filter === 'transferred') list = list.filter((c) => c.transferred);
    if (filter === 'action_needed') list = list.filter((c) => c.action_needed);
    return list.slice(0, limit);
  }

  try {
    let q = supabase.from('call_log').select('*').order('called_at', { ascending: false }).limit(limit);
    if (filter === 'bookings') q = q.eq('booking_made', true);
    if (filter === 'transferred') q = q.eq('transferred', true);
    if (filter === 'action_needed') q = q.eq('action_needed', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[SuperAgent] getRecentCalls failed:', err.message);
    return MOCK_CALLS.slice(0, limit);
  }
}

module.exports = {
  deployAgent,
  verifySubscriber,
  sendSMS,
  processCallWebhook,
  recordCallStarted,
  getAgentStats,
  getRecentCalls,
  buildToolSet,
  placeCallback,
  getConnectionStatus
};
