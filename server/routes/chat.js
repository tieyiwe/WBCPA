// ─────────────────────────────────────────────────────────────────────────────
// Internal Chat — REST API
// Channels (public/private), DMs, group chats, message edit/delete, replies.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { attachActor, requirePermission } = require('../middleware/currentActor');
const svc = require('../services/chatService');
const { listTeamMembers } = require('../services/adminService');

router.use(attachActor);
router.use(requirePermission('chat.use'));

// Roster of people you can message (active members minus yourself)
router.get('/members', (req, res) => {
  const members = listTeamMembers()
    .filter((m) => m.status === 'active' && m.id !== req.actor.id)
    .map((m) => ({ id: m.id, name: m.name, role: m.role, title: m.title, avatar_color: m.avatar_color }));
  res.json({ members });
});

router.get('/conversations', (req, res) => {
  try {
    res.json({ conversations: svc.listConversations(req.actor) });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/discover', (req, res) => {
  res.json({ channels: svc.discoverChannels(req.actor) });
});

router.post('/channels', (req, res) => {
  try {
    res.json({ conversation: svc.createChannel(req.body || {}, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/groups', (req, res) => {
  try {
    res.json({ conversation: svc.createGroup(req.body || {}, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/dm', (req, res) => {
  try {
    const { member_id } = req.body || {};
    res.json({ conversation: svc.openDirectMessage(member_id, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/conversations/:id/messages', (req, res) => {
  try {
    res.json({ messages: svc.listMessages(req.params.id, req.actor) });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/conversations/:id/messages', (req, res) => {
  try {
    res.json({ message: svc.sendMessage(req.params.id, req.body || {}, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.patch('/messages/:id', (req, res) => {
  try {
    res.json({ message: svc.editMessage(req.params.id, req.body || {}, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/messages/:id', (req, res) => {
  try {
    res.json({ message: svc.deleteMessage(req.params.id, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/conversations/:id/join', (req, res) => {
  try {
    res.json({ conversation: svc.joinChannel(req.params.id, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/conversations/:id/members', (req, res) => {
  try {
    res.json({ conversation: svc.addMembers(req.params.id, (req.body || {}).member_ids, req.actor), ok: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;
