// ─────────────────────────────────────────────────────────────────────────────
// Admin API — team, roles, activity, tasks, notes, system settings.
// Every route is gated by the permission middleware. In demo mode the actor's
// role is read from x-demo-role header so the UI role-switcher works.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const svc = require('../services/adminService');
const { attachActor, requirePermission } = require('../middleware/currentActor');
const { ROLES } = require('../services/permissions');

const router = express.Router();

router.use(attachActor);

// ─── Whoami / me ────────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const role = ROLES[req.actor.role] || null;
  res.json({
    actor: req.actor,
    role_detail: role,
    permissions: Object.entries(require('../services/permissions').PERMISSIONS)
      .filter(([, roles]) => roles.includes(req.actor.role))
      .map(([key]) => key)
  });
});

// ─── Team members ───────────────────────────────────────────────────────────
router.get('/team', requirePermission('team.view'), (req, res) => {
  res.json({ members: svc.listTeamMembers() });
});

router.post('/team', requirePermission('team.invite'), (req, res) => {
  try {
    const member = svc.inviteTeamMember(req.body || {}, req.actor);
    res.json({ member });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/team/:id', requirePermission('team.edit'), (req, res) => {
  try {
    const member = svc.updateTeamMember(req.params.id, req.body || {}, req.actor);
    res.json({ member });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/team/:id/deactivate', requirePermission('team.deactivate'), (req, res) => {
  try {
    const member = svc.deactivateTeamMember(req.params.id, req.actor);
    res.json({ member });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/team/:id/reactivate', requirePermission('team.deactivate'), (req, res) => {
  try {
    const member = svc.reactivateTeamMember(req.params.id, req.actor);
    res.json({ member });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Roles & permissions ────────────────────────────────────────────────────
router.get('/roles', requirePermission('roles.view'), (_req, res) => {
  res.json({ roles: svc.listRoles(), matrix: svc.permissionMatrix() });
});

// ─── Activity log ───────────────────────────────────────────────────────────
router.get('/activity', requirePermission('activity.view'), (req, res) => {
  const { limit, action, actor_id } = req.query;
  res.json({
    activity: svc.listActivity({
      limit: limit ? Number(limit) : 100,
      action,
      actor_id
    })
  });
});

// ─── Tasks ──────────────────────────────────────────────────────────────────
router.get('/tasks', requirePermission('tasks.view'), (req, res) => {
  const { view, status, assignee_id } = req.query;
  if (view === 'board') return res.json({ board: svc.tasksByStatus() });
  res.json({ tasks: svc.listTasks({ status, assignee_id }) });
});

router.post('/tasks', requirePermission('tasks.create'), (req, res) => {
  try {
    const task = svc.createTask(req.body || {}, req.actor);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/tasks/:id', requirePermission('tasks.complete'), (req, res) => {
  try {
    const task = svc.updateTask(req.params.id, req.body || {}, req.actor);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/tasks/:id', requirePermission('tasks.delete'), (req, res) => {
  try {
    const task = svc.deleteTask(req.params.id, req.actor);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Notes ──────────────────────────────────────────────────────────────────
router.get('/notes', requirePermission('notes.view'), (req, res) => {
  const { target_type, target_id } = req.query;
  res.json({ notes: svc.listNotes({ target_type, target_id }) });
});

router.post('/notes', requirePermission('notes.create'), (req, res) => {
  try {
    const note = svc.createNote(req.body || {}, req.actor);
    res.json({ note });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/notes/:id/pin', requirePermission('notes.create'), (req, res) => {
  try {
    const note = svc.togglePinNote(req.params.id, req.actor);
    res.json({ note });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/notes/:id', requirePermission('notes.delete.own'), (req, res) => {
  try {
    const note = svc.deleteNote(req.params.id, req.actor);
    res.json({ note });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── System settings ────────────────────────────────────────────────────────
router.get('/settings', requirePermission('system.settings.view'), (_req, res) => {
  res.json({ settings: svc.getSettings() });
});

router.patch('/settings', requirePermission('system.settings.edit'), (req, res) => {
  try {
    const settings = svc.updateSettings(req.body || {}, req.actor);
    res.json({ settings });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/settings/api-keys/:id/rotate', requirePermission('api_keys.rotate'), (req, res) => {
  try {
    const key = svc.rotateApiKey(req.params.id, req.actor);
    res.json({ key });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
