// ─────────────────────────────────────────────────────────────────────────────
// Email routes — recent emails, review queue, resolve, manual inbox sync.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const {
  processInboxEmails,
  getRecentEmails,
  getReviewQueue,
  resolveReviewItem,
  sendEmail
} = require('../services/emailService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const emails = await getRecentEmails(50);
    return res.json({ emails });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/queue', async (req, res) => {
  try {
    const queue = await getReviewQueue();
    return res.json({ queue });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const result = await processInboxEmails();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/resolve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reply, to, subject } = req.body || {};
    if (reply && to && subject) {
      await sendEmail(to, subject, reply);
    }
    const result = await resolveReviewItem(id, reply);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
