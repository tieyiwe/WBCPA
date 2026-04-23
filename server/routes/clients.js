// ─────────────────────────────────────────────────────────────────────────────
// Clients route — CPA client records (separate from subscribers; used for
// deadline reminders). Mock-safe.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { supabase, isConfigured } = require('../services/db');
const { MOCK_CLIENTS } = require('../services/mockData');

const router = express.Router();

router.get('/', async (req, res) => {
  if (!isConfigured()) return res.json({ clients: MOCK_CLIENTS });
  try {
    const { data, error } = await supabase.from('clients').select('*').order('next_deadline', { ascending: true });
    if (error) throw error;
    return res.json({ clients: data || [] });
  } catch (err) {
    return res.json({ clients: MOCK_CLIENTS, warning: err.message });
  }
});

router.post('/', async (req, res) => {
  const payload = req.body || {};
  if (!isConfigured()) {
    const created = { id: `cli_${Date.now()}`, ...payload };
    MOCK_CLIENTS.unshift(created);
    return res.json({ client: created, mock: true });
  }
  try {
    const { data, error } = await supabase.from('clients').insert(payload).select().single();
    if (error) throw error;
    return res.json({ client: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};
  if (!isConfigured()) {
    const client = MOCK_CLIENTS.find((c) => c.id === id);
    if (!client) return res.status(404).json({ error: 'Not found.' });
    Object.assign(client, updates);
    return res.json({ client, mock: true });
  }
  try {
    const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return res.json({ client: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
