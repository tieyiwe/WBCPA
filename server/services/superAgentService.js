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
      description: 'Verify the caller has an active WBCPA subscription.',
      url: `${REPLIT_URL}/api/subscribers/verify`,
      method: 'POST',
      headers: internalHeader,
      body: { phone: '{{from}}', email: '{{email}}' },
      response: { verified: 'boolean', name: 'string', tier: 'string', message: 'string' }
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

async function verifySubscriber(phone, email) {
  if (!isConfigured()) {
    // Try a naive mock match by phone; else return the first active VIP.
    const matched = MOCK_SUBSCRIBERS.find(
      (s) => s.phone === phone || s.email === email
    );
    const sub = matched || MOCK_SUBSCRIBERS[0];
    return {
      verified: sub.status === 'active',
      subscriber: sub,
      tier: sub.tier
    };
  }

  try {
    let query = supabase.from('subscribers').select('*').eq('status', 'active');
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

    // Expiration check
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      return { verified: false, subscriber: sub, tier: sub.tier };
    }

    return { verified: true, subscriber: sub, tier: sub.tier };
  } catch (err) {
    console.warn('[SuperAgent] verifySubscriber DB failed, mock fallback:', err.message);
    const sub = MOCK_SUBSCRIBERS[0];
    return { verified: true, subscriber: sub, tier: sub.tier };
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
    'Open warmly: identify yourself as the WBCPA Super Agent calling them back. Confirm it is a good time. Use your existing tools (CheckAvailability, BookAppointment, SendSMSSummary) as needed.'
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

    return {
      ok: true,
      call_id: response.data?.call_id || response.data?.id,
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
      call_ended: `${REPLIT_URL}/api/webhooks/bland/call-ended`,
      verify_subscriber: `${REPLIT_URL}/api/subscribers/verify`,
      check_availability: `${REPLIT_URL}/api/calendar/availability`,
      book_appointment: `${REPLIT_URL}/api/calendar/book`,
      send_sms: `${REPLIT_URL}/api/voice/sms`
    },
    staff: {
      transfer_phone: WBCPA_STAFF_PHONE
    },
    base_url: REPLIT_URL,
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
    'WBCPA Super Agent — call recap:',
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

async function processCallWebhook(payload = {}) {
  const {
    call_id,
    from,
    duration,
    transcript,
    summary,
    recording_url,
    transferred,
    variables = {}
  } = payload;

  const callerPhone = from || variables.from;
  const clientName = variables.client_name || variables.name || 'Unknown Caller';
  const appointmentDetails = variables.appointment_details || null;
  const actionNeeded = detectActionNeeded(summary);

  let subscriberId = null;
  if (isConfigured() && callerPhone) {
    try {
      const { data } = await supabase
        .from('subscribers')
        .select('id')
        .eq('phone', callerPhone)
        .maybeSingle();
      subscriberId = data?.id || null;
    } catch (err) {
      console.warn('[SuperAgent] subscriber lookup failed:', err.message);
    }
  }

  const callRecord = {
    bland_call_id: call_id,
    caller_number: callerPhone,
    subscriber_id: subscriberId,
    client_name: clientName,
    duration_seconds: Number(duration) || 0,
    transcript: transcript || null,
    summary: summary || null,
    topics_discussed: variables.topics || null,
    action_needed: actionNeeded,
    booking_made: Boolean(variables.booking_made),
    transferred: Boolean(transferred),
    recording_url: recording_url || null,
    appointment_details: appointmentDetails,
    sms_sent: false,
    called_at: new Date().toISOString()
  };

  if (isConfigured()) {
    try {
      await supabase.from('call_log').upsert(callRecord, { onConflict: 'bland_call_id' });
    } catch (err) {
      console.warn('[SuperAgent] call_log upsert failed:', err.message);
    }
  } else {
    MOCK_CALLS.unshift({ id: `call_${Date.now()}`, ...callRecord });
  }

  // SMS recap if the call was substantive
  if (callRecord.duration_seconds > 120 && callRecord.summary && callerPhone) {
    await sendSMS(callerPhone, callRecord.summary, appointmentDetails);
    callRecord.sms_sent = true;
  }

  // Staff notification for action-needed calls (email service handles delivery)
  if (actionNeeded) {
    console.log(`[SuperAgent] ACTION NEEDED on call ${call_id} from ${callerPhone} — staff should review.`);
  }

  return { ok: true, action_needed: actionNeeded };
}

async function getAgentStats() {
  const agentName = 'WBCPA Super Agent';
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
  getAgentStats,
  getRecentCalls,
  buildToolSet,
  placeCallback,
  getConnectionStatus
};
