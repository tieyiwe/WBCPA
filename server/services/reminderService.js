// ─────────────────────────────────────────────────────────────────────────────
// Reminder Service — daily CRON that emails clients with deadlines coming up.
// Mock-safe: logs output when APIs aren't configured.
// ─────────────────────────────────────────────────────────────────────────────

const { supabase, isConfigured } = require('./db');
const { MOCK_CLIENTS } = require('./mockData');
const { sendEmail } = require('./emailService');
const { getCurrentSeason } = require('./seasonService');

async function sendDeadlineReminders() {
  const horizon = 14; // days
  const now = new Date();
  const cutoff = new Date(now.getTime() + horizon * 86400000);

  let clients = [];
  if (isConfigured()) {
    try {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .lte('next_deadline', cutoff.toISOString())
        .gte('next_deadline', now.toISOString());
      clients = data || [];
    } catch (err) {
      console.warn('[Reminder] DB read failed, using mock:', err.message);
      clients = MOCK_CLIENTS;
    }
  } else {
    clients = MOCK_CLIENTS;
  }

  const season = await getCurrentSeason();
  let sent = 0;

  for (const client of clients) {
    if (!client.next_deadline || !client.email) continue;
    const daysOut = Math.ceil((new Date(client.next_deadline) - now) / 86400000);
    if (daysOut < 0 || daysOut > horizon) continue;

    const subject = `Deadline reminder: ${client.next_deadline_type} in ${daysOut} day${daysOut === 1 ? '' : 's'}`;
    const body = [
      `Hi ${client.name || 'there'},`,
      '',
      `A quick heads-up from WB CPA — your ${client.next_deadline_type} is coming up on ${new Date(client.next_deadline).toLocaleDateString('en-US', { timeZone: 'America/New_York' })} Eastern Time.`,
      '',
      season === 'PEAK_SEASON'
        ? 'We\'re in peak season, so please send any outstanding documents as soon as you can.'
        : 'Reply to this email if you need help preparing, or call the voice agent at your member number.',
      '',
      '— The WBCPA Team'
    ].join('\n');

    const result = await sendEmail(client.email, subject, body);
    if (result.sent || result.mock) sent++;
  }

  console.log(`[Reminder] Deadline reminder run complete — ${sent}/${clients.length} processed.`);
  return { sent, total: clients.length };
}

module.exports = { sendDeadlineReminders };
