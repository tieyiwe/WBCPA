// ─────────────────────────────────────────────────────────────────────────────
// Subscribers route — CRUD + /verify endpoint called by Bland AI.
// Mock-safe fallbacks across every handler.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { supabase, isConfigured } = require('../services/db');
const { MOCK_SUBSCRIBERS, MOCK_CALLS } = require('../services/mockData');
const { verifySubscriber } = require('../services/superAgentService');
const { guardInternal } = require('../middleware/internalKey');

const router = express.Router();

// ─── Bland AI callback ───────────────────────────────────────────────────────
router.post('/verify', guardInternal, async (req, res) => {
  const { phone, email } = req.body || {};
  const result = await verifySubscriber(phone, email);
  if (result.verified && result.subscriber) {
    const s = result.subscriber;
    // Spoken history line the agent can read back naturally.
    const recent = result.recent_calls || [];
    const historyLine = recent.length
      ? `Last contact: ${recent[0].summary || (recent[0].topics || []).join(', ') || 'general inquiry'}.`
      : 'No prior call on file.';
    return res.json({
      verified: true,
      name: s.name,
      first_name: (s.name || '').split(' ')[0],
      tier: s.tier,
      status: s.status,
      member_since: s.subscribed_at || s.created_at || null,
      notes: s.notes || null,
      call_count: s.call_count || 0,
      last_call: s.last_call || null,
      recent_calls: recent,
      history_summary: historyLine,
      message: `Verified ${s.tier} member ${s.name}. ${historyLine}`
    });
  }
  return res.json({
    verified: false,
    name: null,
    tier: null,
    message: 'No active subscription found for the provided phone or email. Treat as a prospective client.'
  });
});

// Look up a customer's fuller profile by phone/email (agent or staff use).
router.post('/lookup', guardInternal, async (req, res) => {
  const { phone, email } = req.body || {};
  const result = await verifySubscriber(phone, email);
  if (!result.subscriber) {
    return res.json({ found: false, message: 'No matching customer on file.' });
  }
  const s = result.subscriber;
  return res.json({
    found: true,
    verified: result.verified,
    subscriber: {
      id: s.id, name: s.name, email: s.email, phone: s.phone,
      tier: s.tier, status: s.status, notes: s.notes,
      call_count: s.call_count, last_call: s.last_call,
      subscribed_at: s.subscribed_at, expires_at: s.expires_at
    },
    recent_calls: result.recent_calls || []
  });
});

// ─── Admin endpoints ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (!isConfigured()) return res.json({ subscribers: MOCK_SUBSCRIBERS });
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ subscribers: data || [] });
  } catch (err) {
    return res.json({ subscribers: MOCK_SUBSCRIBERS, warning: err.message });
  }
});

router.get('/stats/overview', async (req, res) => {
  if (!isConfigured()) {
    const total = MOCK_SUBSCRIBERS.length;
    const active = MOCK_SUBSCRIBERS.filter((s) => s.status === 'active').length;
    const expired = MOCK_SUBSCRIBERS.filter((s) => s.status === 'expired').length;
    const tiers = MOCK_SUBSCRIBERS.reduce((acc, s) => {
      acc[s.tier] = (acc[s.tier] || 0) + 1;
      return acc;
    }, {});
    const totalCalls = MOCK_SUBSCRIBERS.reduce((sum, s) => sum + (s.call_count || 0), 0);
    return res.json({ total, active, expired, tiers, totalCalls });
  }

  try {
    const { data, error } = await supabase.from('subscribers').select('status, tier, call_count');
    if (error) throw error;
    const total = data.length;
    const active = data.filter((s) => s.status === 'active').length;
    const expired = data.filter((s) => s.status === 'expired').length;
    const tiers = data.reduce((acc, s) => {
      acc[s.tier] = (acc[s.tier] || 0) + 1;
      return acc;
    }, {});
    const totalCalls = data.reduce((sum, s) => sum + (s.call_count || 0), 0);
    return res.json({ total, active, expired, tiers, totalCalls });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isConfigured()) {
    const sub = MOCK_SUBSCRIBERS.find((s) => s.id === id);
    if (!sub) return res.status(404).json({ error: 'Not found.' });
    const calls = MOCK_CALLS.filter((c) => c.subscriber_id === id);
    return res.json({ subscriber: sub, calls });
  }
  try {
    const { data: sub, error } = await supabase.from('subscribers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!sub) return res.status(404).json({ error: 'Not found.' });
    const { data: calls } = await supabase
      .from('call_log')
      .select('*')
      .eq('subscriber_id', id)
      .order('called_at', { ascending: false });
    return res.json({ subscriber: sub, calls: calls || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, email, phone, tier = 'standard', status = 'active', notes } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone is required.' });

  const newSub = {
    name,
    email,
    phone,
    tier,
    status,
    notes,
    call_count: 0,
    subscribed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    created_at: new Date().toISOString()
  };

  if (!isConfigured()) {
    const created = { id: `sub_${Date.now()}`, ...newSub };
    MOCK_SUBSCRIBERS.unshift(created);
    return res.json({ subscriber: created, mock: true });
  }

  try {
    const { data, error } = await supabase.from('subscribers').insert(newSub).select().single();
    if (error) throw error;
    return res.json({ subscriber: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};
  updates.updated_at = new Date().toISOString();

  if (!isConfigured()) {
    const sub = MOCK_SUBSCRIBERS.find((s) => s.id === id);
    if (!sub) return res.status(404).json({ error: 'Not found.' });
    Object.assign(sub, updates);
    return res.json({ subscriber: sub, mock: true });
  }

  try {
    const { data, error } = await supabase
      .from('subscribers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ subscriber: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
