// ─────────────────────────────────────────────────────────────────────────────
// Dashboard overview endpoint — aggregates data for the main Dashboard page.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { supabase, isConfigured } = require('../services/db');
const {
  MOCK_SUBSCRIBERS,
  MOCK_CALLS,
  MOCK_REVIEW_QUEUE,
  MOCK_EMAILS,
  MOCK_CLIENTS
} = require('../services/mockData');
const { getCurrentSeason, SEASONS } = require('../services/seasonService');
const { getAgentStats } = require('../services/superAgentService');
const { getTodayStats } = require('../services/calendarService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [season, agentStats, todayCalendar] = await Promise.all([
      getCurrentSeason(),
      getAgentStats(),
      getTodayStats()
    ]);

    let subscriberStats;
    let recentCalls;
    let recentEmails;
    let openReviews;
    let upcomingDeadlines;

    if (isConfigured()) {
      const [subsRes, callsRes, emailsRes, reviewRes, clientsRes] = await Promise.all([
        supabase.from('subscribers').select('status, tier'),
        supabase.from('call_log').select('*').order('called_at', { ascending: false }).limit(5),
        supabase.from('email_log').select('*').order('received_at', { ascending: false }).limit(5),
        supabase.from('review_queue').select('*').eq('status', 'open').limit(10),
        supabase.from('clients').select('*').order('next_deadline', { ascending: true }).limit(10)
      ]);

      const subData = subsRes.data || MOCK_SUBSCRIBERS;
      subscriberStats = {
        total: subData.length,
        active: subData.filter((s) => s.status === 'active').length,
        tiers: subData.reduce((a, s) => {
          a[s.tier] = (a[s.tier] || 0) + 1;
          return a;
        }, {})
      };
      recentCalls = callsRes.data?.length ? callsRes.data : MOCK_CALLS.slice(0, 5);
      recentEmails = emailsRes.data?.length ? emailsRes.data : MOCK_EMAILS.slice(0, 5);
      openReviews = reviewRes.data?.length ? reviewRes.data : MOCK_REVIEW_QUEUE;

      const now = Date.now();
      const cutoff = now + 14 * 86400000;
      const sourceDeadlines = clientsRes.data?.length ? clientsRes.data : MOCK_CLIENTS;
      upcomingDeadlines = sourceDeadlines.filter((c) => {
        if (!c.next_deadline) return false;
        const d = new Date(c.next_deadline).getTime();
        return d >= now && d <= cutoff;
      });
    } else {
      subscriberStats = {
        total: MOCK_SUBSCRIBERS.length,
        active: MOCK_SUBSCRIBERS.filter((s) => s.status === 'active').length,
        tiers: MOCK_SUBSCRIBERS.reduce((a, s) => {
          a[s.tier] = (a[s.tier] || 0) + 1;
          return a;
        }, {})
      };
      recentCalls = MOCK_CALLS.slice(0, 5);
      recentEmails = MOCK_EMAILS.slice(0, 5);
      openReviews = MOCK_REVIEW_QUEUE.filter((r) => r.status === 'open');
      const now = Date.now();
      const cutoff = now + 14 * 86400000;
      upcomingDeadlines = MOCK_CLIENTS.filter((c) => {
        const d = new Date(c.next_deadline).getTime();
        return d >= now && d <= cutoff;
      });
    }

    // 7-day call trend
    const trendBuckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return { date: d, label: d.toLocaleDateString('en-US', { weekday: 'short' }), count: 0 };
    });

    const callSource = isConfigured() ? [] : MOCK_CALLS;
    if (isConfigured()) {
      try {
        const weekStart = trendBuckets[0].date.toISOString();
        const { data } = await supabase.from('call_log').select('called_at').gte('called_at', weekStart);
        (data || []).forEach((c) => {
          const day = new Date(c.called_at);
          day.setHours(0, 0, 0, 0);
          const bucket = trendBuckets.find((b) => b.date.getTime() === day.getTime());
          if (bucket) bucket.count++;
        });
      } catch { /* ignore */ }
    } else {
      callSource.forEach((c) => {
        const day = new Date(c.called_at);
        day.setHours(0, 0, 0, 0);
        const bucket = trendBuckets.find((b) => b.date.getTime() === day.getTime());
        if (bucket) bucket.count++;
      });
    }

    return res.json({
      season: { key: season, ...(SEASONS[season] || {}) },
      agentStats,
      subscriberStats,
      todayCalendar,
      recentCalls,
      recentEmails,
      openReviews,
      upcomingDeadlines,
      callTrend: trendBuckets.map((b) => ({ label: b.label, count: b.count })),
      topSubscribers: MOCK_SUBSCRIBERS.slice(0, 5)
    });
  } catch (err) {
    console.error('[Dashboard] overview error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
