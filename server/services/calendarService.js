// ─────────────────────────────────────────────────────────────────────────────
// Calendar Service — Google Calendar integration for availability + booking.
// Falls back to generated mock slots when Google OAuth isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

const { supabase, isConfigured } = require('./db');
const { MOCK_APPOINTMENTS } = require('./mockData');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const STAFF_EMAIL = process.env.WBCPA_STAFF_EMAIL || 'staff@wbcpa.com';

const googleConfigured = Boolean(
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN
);

let calendarClient = null;
function getCalendarClient() {
  if (!googleConfigured) return null;
  if (calendarClient) return calendarClient;

  try {
    const { google } = require('googleapis');
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    calendarClient = google.calendar({ version: 'v3', auth: oAuth2Client });
    return calendarClient;
  } catch (err) {
    console.warn('[Calendar] Google client init failed:', err.message);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const ET_TZ = 'America/New_York';

function formatDisplay(iso) {
  const date = new Date(iso);
  const dateStr = date.toLocaleDateString('en-US', {
    timeZone: ET_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: ET_TZ,
    hour: 'numeric',
    minute: '2-digit'
  });
  return {
    displayDate: dateStr,
    displayTime: `${timeStr} ET`,
    displayFull: `${dateStr} at ${timeStr} ET`
  };
}

function isBusinessTimeET(date) {
  const dow = Number(
    date.toLocaleString('en-US', { timeZone: ET_TZ, weekday: 'short' }) === 'Sat' ? 6 :
    date.toLocaleString('en-US', { timeZone: ET_TZ, weekday: 'short' }) === 'Sun' ? 0 :
    date.getDay()
  );
  // Weekdays only
  if (dow === 0 || dow === 6) return false;
  const hour = Number(
    date.toLocaleString('en-US', { timeZone: ET_TZ, hour: 'numeric', hour12: false })
  );
  // 9AM–5PM ET, skip lunch 12–1PM
  if (hour < 9 || hour >= 17) return false;
  if (hour === 12) return false;
  return true;
}

function generateMockSlots(maxSlots = 6) {
  const slots = [];
  // Start at tomorrow 9AM ET
  const start = new Date();
  start.setDate(start.getDate() + 1);
  // Normalize to 9AM ET: build from UTC midpoint; safe enough for mock display.
  start.setHours(14, 0, 0, 0); // 9AM ET is ~14:00 UTC during EST
  let cursor = new Date(start);

  while (slots.length < maxSlots && slots.length < 100) {
    const dow = cursor.getUTCDay();
    const hourET = Number(
      cursor.toLocaleString('en-US', { timeZone: ET_TZ, hour: 'numeric', hour12: false })
    );

    // skip weekends
    if (dow === 0 || dow === 6) {
      cursor = new Date(cursor.getTime() + DAY_MS);
      cursor.setUTCHours(14, 0, 0, 0);
      continue;
    }

    // skip lunch 12–1 ET
    if (hourET === 12) {
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
      continue;
    }

    // Stop after 5PM ET → roll to next weekday 9AM ET
    if (hourET >= 17 || hourET < 9) {
      cursor = new Date(cursor.getTime() + DAY_MS);
      cursor.setUTCHours(14, 0, 0, 0);
      continue;
    }

    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor.getTime() + 30 * 60 * 1000);
    const disp = formatDisplay(slotStart.toISOString());

    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      displayDate: disp.displayDate,
      displayTime: disp.displayTime,
      displayFull: disp.displayFull
    });

    cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
  }

  return slots;
}

async function getAvailableSlots(daysAhead = 5, maxSlots = 6) {
  if (!googleConfigured) {
    return generateMockSlots(maxSlots);
  }

  const cal = getCalendarClient();
  if (!cal) return generateMockSlots(maxSlots);

  try {
    const timeMin = new Date();
    const timeMax = new Date(Date.now() + daysAhead * DAY_MS);

    const events = await cal.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const blocked = (events.data.items || [])
      .filter((e) => e.start?.dateTime && e.end?.dateTime)
      .map((e) => ({
        start: new Date(e.start.dateTime).getTime(),
        end: new Date(e.end.dateTime).getTime()
      }));

    const slots = [];
    let cursor = new Date();
    // round up to next 30-min boundary
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + (30 - (cursor.getMinutes() % 30)));

    while (slots.length < maxSlots && cursor.getTime() < timeMax.getTime()) {
      if (!isBusinessTimeET(cursor)) {
        cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
        continue;
      }

      const slotStart = cursor.getTime();
      const slotEnd = slotStart + 30 * 60 * 1000;
      const conflict = blocked.some((b) => b.start < slotEnd && b.end > slotStart);

      if (!conflict) {
        const startIso = new Date(slotStart).toISOString();
        const endIso = new Date(slotEnd).toISOString();
        const disp = formatDisplay(startIso);
        slots.push({
          start: startIso,
          end: endIso,
          displayDate: disp.displayDate,
          displayTime: disp.displayTime,
          displayFull: disp.displayFull
        });
      }

      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
    }

    return slots;
  } catch (err) {
    console.warn('[Calendar] getAvailableSlots failed, using mock:', err.message);
    return generateMockSlots(maxSlots);
  }
}

async function bookAppointment(params = {}) {
  const {
    clientName = 'Client',
    clientEmail,
    clientPhone,
    startTime,
    preferredTime,
    slotIndex,
    topic = 'CPA consultation',
    notes,
    callLogId,
    subscriberId
  } = params;

  // Resolve startTime from slotIndex / preferredTime if not provided
  let resolvedStart = startTime;
  if (!resolvedStart) {
    const slots = await getAvailableSlots(5, 6);
    if (Number.isInteger(slotIndex) && slots[slotIndex]) {
      resolvedStart = slots[slotIndex].start;
    } else if (preferredTime && slots.length) {
      // naive match: take the first slot whose displayFull contains a chunk of preferredTime
      const tokens = String(preferredTime).toLowerCase().split(/\s+/);
      const matched = slots.find((s) =>
        tokens.every((t) => s.displayFull.toLowerCase().includes(t))
      );
      resolvedStart = (matched || slots[0]).start;
    } else if (slots.length) {
      resolvedStart = slots[0].start;
    }
  }

  if (!resolvedStart) {
    return { success: false, message: 'No available slots could be resolved.' };
  }

  const startIso = new Date(resolvedStart).toISOString();
  const endIso = new Date(new Date(resolvedStart).getTime() + 30 * 60 * 1000).toISOString();
  const disp = formatDisplay(startIso);

  let googleEventId = null;
  let meetLink = null;

  const cal = getCalendarClient();
  if (cal) {
    try {
      const resp = await cal.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          summary: `CPA Consultation — ${clientName}`,
          description: [
            `Topic: ${topic}`,
            notes ? `Notes: ${notes}` : '',
            clientPhone ? `Phone: ${clientPhone}` : '',
            'Booked by WBCPA Command Center.'
          ].filter(Boolean).join('\n'),
          start: { dateTime: startIso, timeZone: ET_TZ },
          end: { dateTime: endIso, timeZone: ET_TZ },
          attendees: [
            { email: STAFF_EMAIL },
            clientEmail ? { email: clientEmail } : null
          ].filter(Boolean),
          conferenceData: {
            createRequest: {
              requestId: `wbcpa-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 },
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 15 }
            ]
          }
        }
      });

      googleEventId = resp.data.id;
      meetLink = resp.data.hangoutLink ||
        resp.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
        null;
    } catch (err) {
      console.warn('[Calendar] Google event create failed:', err.message);
    }
  }

  const appointment = {
    subscriber_id: subscriberId || null,
    call_log_id: callLogId || null,
    client_name: clientName,
    client_email: clientEmail || null,
    client_phone: clientPhone || null,
    topic,
    scheduled_at: startIso,
    duration_min: 30,
    google_event_id: googleEventId,
    meet_link: meetLink,
    status: 'confirmed',
    notes: notes || null,
    created_at: new Date().toISOString()
  };

  if (isConfigured()) {
    try {
      await supabase.from('appointments').insert(appointment);
    } catch (err) {
      console.warn('[Calendar] DB insert failed:', err.message);
    }
  } else {
    MOCK_APPOINTMENTS.push({ id: `appt_${Date.now()}`, ...appointment });
  }

  return {
    success: true,
    displayTime: disp.displayFull,
    meetLink,
    googleEventId,
    message: `Your consultation is confirmed for ${disp.displayFull}.`
  };
}

async function cancelAppointment(appointmentId, reason) {
  if (!appointmentId) return { success: false, message: 'Missing appointmentId.' };

  let appointment = null;
  if (isConfigured()) {
    try {
      const { data } = await supabase.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
      appointment = data;
    } catch (err) {
      console.warn('[Calendar] appointment lookup failed:', err.message);
    }
  } else {
    appointment = MOCK_APPOINTMENTS.find((a) => a.id === appointmentId);
  }

  const cal = getCalendarClient();
  if (cal && appointment?.google_event_id) {
    try {
      await cal.events.delete({
        calendarId: GOOGLE_CALENDAR_ID,
        eventId: appointment.google_event_id,
        sendUpdates: 'all'
      });
    } catch (err) {
      console.warn('[Calendar] Google event delete failed:', err.message);
    }
  }

  if (isConfigured()) {
    try {
      await supabase
        .from('appointments')
        .update({ status: 'cancelled', notes: reason || appointment?.notes || null })
        .eq('id', appointmentId);
    } catch (err) {
      console.warn('[Calendar] status update failed:', err.message);
    }
  } else {
    const target = MOCK_APPOINTMENTS.find((a) => a.id === appointmentId);
    if (target) target.status = 'cancelled';
  }

  return { success: true, message: 'Appointment cancelled.' };
}

async function getUpcomingAppointments(days = 7) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * DAY_MS);

  if (!isConfigured()) {
    return MOCK_APPOINTMENTS
      .filter((a) => new Date(a.scheduled_at) >= now && new Date(a.scheduled_at) <= cutoff)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', cutoff.toISOString())
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[Calendar] getUpcoming failed, mock fallback:', err.message);
    return MOCK_APPOINTMENTS;
  }
}

async function getTodayStats() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);

  if (!isConfigured()) {
    const todays = MOCK_APPOINTMENTS.filter(
      (a) => new Date(a.scheduled_at) >= start && new Date(a.scheduled_at) <= end
    );
    return { todayCount: todays.length, appointments: todays };
  }

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return { todayCount: (data || []).length, appointments: data || [] };
  } catch (err) {
    console.warn('[Calendar] getTodayStats failed:', err.message);
    return { todayCount: 0, appointments: [] };
  }
}

module.exports = {
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
  getUpcomingAppointments,
  getTodayStats
};
