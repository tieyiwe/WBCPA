// ─────────────────────────────────────────────────────────────────────────────
// Email Service — Gmail intake + OpenAI classification + auto-reply/drafting.
// Everything degrades gracefully to mock mode when env vars aren't set.
// ─────────────────────────────────────────────────────────────────────────────

const { supabase, isConfigured } = require('./db');
const { MOCK_EMAILS, MOCK_REVIEW_QUEUE } = require('./mockData');
const { getCurrentSeason } = require('./seasonService');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STAFF_EMAIL = process.env.WBCPA_STAFF_EMAIL || 'staff@wbcpa.com';

const gmailConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);

let gmailClient = null;
function getGmailClient() {
  if (!gmailConfigured) return null;
  if (gmailClient) return gmailClient;
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    gmailClient = google.gmail({ version: 'v1', auth });
    return gmailClient;
  } catch (err) {
    console.warn('[Email] Gmail client init failed:', err.message);
    return null;
  }
}

let openaiClient = null;
function getOpenAI() {
  if (!OPENAI_API_KEY) return null;
  if (openaiClient) return openaiClient;
  try {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    return openaiClient;
  } catch (err) {
    console.warn('[Email] OpenAI client init failed:', err.message);
    return null;
  }
}

// ─── Header + body decoding helpers ──────────────────────────────────────────

function extractHeader(headers, name) {
  const match = (headers || []).find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return match?.value || '';
}

function decodeBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts && payload.parts.length) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const nested = decodeBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function parseFromHeader(fromHeader) {
  const match = fromHeader.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (!match) return { name: fromHeader, email: fromHeader };
  return { name: (match[1] || '').trim() || match[2], email: match[2] };
}

// ─── Classification + drafting ───────────────────────────────────────────────

async function classifyEmail(subject, body) {
  const openai = getOpenAI();
  if (!openai) {
    return {
      urgency: 'low',
      type: 'question',
      needs_human: false,
      reason: 'Mock classification — OPENAI_API_KEY not set.',
      summary: `[MOCK] ${(subject || '').slice(0, 60)}`
    };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You triage inbound CPA client emails. Respond in JSON with keys: urgency (low|medium|high), type (question|logistics|irs_notice|complaint|other), needs_human (boolean), reason (short string), summary (one sentence).'
        },
        {
          role: 'user',
          content: `Subject: ${subject}\n\nBody:\n${body}`
        }
      ]
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    return {
      urgency: parsed.urgency || 'low',
      type: parsed.type || 'question',
      needs_human: Boolean(parsed.needs_human),
      reason: parsed.reason || '',
      summary: parsed.summary || subject
    };
  } catch (err) {
    console.warn('[Email] classifyEmail failed, defaulting:', err.message);
    return { urgency: 'low', type: 'other', needs_human: true, reason: 'Classifier error', summary: subject };
  }
}

async function draftReply(clientName, subject, body, classification, season) {
  const openai = getOpenAI();
  if (!openai) {
    return [
      `Hi ${clientName || 'there'},`,
      '',
      'Thanks for reaching out — we\'ve received your note and will have a detailed response shortly.',
      '',
      'In the meantime, if it helps, our voice agent is available 24/7 at the number on your membership card for quick questions.',
      '',
      'Warmly,',
      'The WBCPA Team',
      '',
      '[MOCK DRAFT — OPENAI_API_KEY not configured]'
    ].join('\n');
  }

  const tonePrimer = season === 'PEAK_SEASON'
    ? 'Tone: urgent and action-oriented. Reference the April 15 deadline when relevant.'
    : season === 'EXTENSION'
      ? 'Tone: structured and compliance-focused. Reference the October 15 extended deadline when relevant.'
      : 'Tone: proactive and planning-focused. Encourage early prep before year-end.';

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior CPA writing warm, concise email replies on behalf of WB CPA.',
            tonePrimer,
            'Always sign off as "The WBCPA Team".',
            'Keep replies under 200 words. Use plain text, not markdown.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            `Client name: ${clientName || 'Client'}`,
            `Subject: ${subject}`,
            '',
            'Client email body:',
            body,
            '',
            `Triage: ${JSON.stringify(classification)}`
          ].join('\n')
        }
      ]
    });
    return resp.choices[0].message.content.trim();
  } catch (err) {
    console.warn('[Email] draftReply failed:', err.message);
    return null;
  }
}

async function sendEmail(to, subject, body) {
  const gmail = getGmailClient();
  if (!gmail) {
    console.log(`[EMAIL MOCK] Would send to: ${to} | subject: ${subject}`);
    return { sent: false, mock: true };
  }

  try {
    const raw = Buffer.from(
      [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        body
      ].join('\r\n')
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });
    return { sent: true };
  } catch (err) {
    console.warn('[Email] sendEmail failed:', err.message);
    return { sent: false, error: err.message };
  }
}

// ─── Inbox scan CRON job ─────────────────────────────────────────────────────

async function processInboxEmails() {
  if (!gmailConfigured) {
    console.log('[EMAIL MOCK] Inbox scan skipped — GOOGLE_CLIENT_ID not configured.');
    return { processed: 0, mock: true };
  }

  const gmail = getGmailClient();
  if (!gmail) return { processed: 0, mock: true };

  let processed = 0;

  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread newer_than:10m',
      maxResults: 25
    });
    const messages = list.data.messages || [];
    const season = await getCurrentSeason();

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const headers = full.data.payload?.headers || [];
        const from = extractHeader(headers, 'From');
        const subject = extractHeader(headers, 'Subject');
        const { name: clientName, email: clientEmail } = parseFromHeader(from);
        const body = decodeBody(full.data.payload) || '(no body)';

        // De-dup
        if (isConfigured()) {
          const { data: existing } = await supabase
            .from('email_log')
            .select('id')
            .eq('gmail_message_id', msg.id)
            .maybeSingle();
          if (existing) continue;
        }

        const classification = await classifyEmail(subject, body);

        const logRow = {
          gmail_message_id: msg.id,
          client_name: clientName,
          client_email: clientEmail,
          subject,
          body,
          received_at: new Date().toISOString(),
          classification: classification.type,
          urgency: classification.urgency,
          needs_human: classification.needs_human,
          status: classification.needs_human ? 'review_needed' : 'pending',
          ai_draft: null,
          sent_at: null,
          season,
          created_at: new Date().toISOString()
        };

        if (classification.needs_human) {
          if (isConfigured()) {
            const { data: inserted } = await supabase.from('email_log').insert(logRow).select().single();
            await supabase.from('review_queue').insert({
              type: 'email',
              email_log_id: inserted?.id || null,
              client_name: clientName,
              subject,
              reason_flagged: classification.reason,
              urgency: classification.urgency,
              status: 'open',
              created_at: new Date().toISOString()
            });
          }
          await sendEmail(
            STAFF_EMAIL,
            `[REVIEW] ${subject}`,
            `Flagged by AI agent: ${classification.reason}\n\nFrom: ${from}\n\n${body}`
          );
        } else {
          const draft = await draftReply(clientName, subject, body, classification, season);
          if (draft) {
            const sendResult = await sendEmail(clientEmail, `Re: ${subject}`, draft);
            logRow.ai_draft = draft;
            logRow.status = sendResult.sent ? 'sent' : 'draft_created';
            if (sendResult.sent) logRow.sent_at = new Date().toISOString();
          }
          if (isConfigured()) {
            await supabase.from('email_log').insert(logRow);
          }
        }

        // Mark read
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: { removeLabelIds: ['UNREAD'] }
          });
        } catch (e) { /* non-fatal */ }

        processed++;
      } catch (innerErr) {
        console.warn('[Email] message processing error:', innerErr.message);
      }
    }
  } catch (err) {
    console.warn('[Email] processInboxEmails failed:', err.message);
  }

  return { processed };
}

// ─── Admin dashboard helpers ─────────────────────────────────────────────────

async function getRecentEmails(limit = 20) {
  if (!isConfigured()) return MOCK_EMAILS.slice(0, limit);
  try {
    const { data, error } = await supabase
      .from('email_log')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[Email] getRecentEmails failed:', err.message);
    return MOCK_EMAILS.slice(0, limit);
  }
}

async function getReviewQueue() {
  if (!isConfigured()) return MOCK_REVIEW_QUEUE.filter((r) => r.status === 'open');
  try {
    const { data, error } = await supabase
      .from('review_queue')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[Email] getReviewQueue failed:', err.message);
    return MOCK_REVIEW_QUEUE;
  }
}

async function resolveReviewItem(id, reply) {
  if (!isConfigured()) {
    const item = MOCK_REVIEW_QUEUE.find((r) => r.id === id);
    if (item) {
      item.status = 'resolved';
      item.resolved_at = new Date().toISOString();
    }
    return { ok: true, mock: true };
  }
  try {
    await supabase
      .from('review_queue')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), notes: reply || null })
      .eq('id', id);
    return { ok: true };
  } catch (err) {
    console.warn('[Email] resolveReviewItem failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  processInboxEmails,
  classifyEmail,
  draftReply,
  sendEmail,
  getRecentEmails,
  getReviewQueue,
  resolveReviewItem
};
