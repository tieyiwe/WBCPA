// ─────────────────────────────────────────────────────────────────────────────
// Calendar routes — availability/book for Bland AI + admin endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const {
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
  getUpcomingAppointments,
  getTodayStats
} = require('../services/calendarService');
const { guardInternal } = require('../middleware/internalKey');

const router = express.Router();

// ─── Bland AI tool endpoints ─────────────────────────────────────────────────

router.post('/availability', guardInternal, async (req, res) => {
  try {
    const daysAhead = Number(req.body?.daysAhead) || 5;
    const slots = await getAvailableSlots(daysAhead, 6);
    const spokenOptions = slots.length
      ? slots
          .map((s, i) => `Option ${i + 1}: ${s.displayFull}`)
          .join('. ') + '.'
      : 'I don\'t see any openings in the next week — I can transfer you to our staff line.';
    const message = slots.length
      ? 'Here are the next available consultation times.'
      : 'No availability found.';
    return res.json({ available: slots.length > 0, slots, spokenOptions, message });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/book', guardInternal, async (req, res) => {
  try {
    const result = await bookAppointment(req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Admin endpoints ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const days = Number(req.query.days) || 14;
    const appointments = await getUpcomingAppointments(days);
    return res.json({ appointments });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/slots', async (req, res) => {
  try {
    const slots = await getAvailableSlots(5, 6);
    return res.json({ slots });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/today', async (req, res) => {
  try {
    const stats = await getTodayStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Allow admin dashboard to book manually without x-api-key header.
router.post('/book-admin', async (req, res) => {
  try {
    const result = await bookAppointment(req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/cancel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const result = await cancelAppointment(id, reason);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
