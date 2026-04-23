// ─────────────────────────────────────────────────────────────────────────────
// Admin service — team members, activity log, tasks, notes, system settings.
// Operates on in-memory mock data (deep-cloned once at boot). Writes persist
// for the life of the process. When Supabase is wired up later this module is
// the only one that changes.
// ─────────────────────────────────────────────────────────────────────────────

const {
  MOCK_TEAM_MEMBERS,
  MOCK_ACTIVITY_LOG,
  MOCK_TASKS,
  MOCK_NOTES,
  MOCK_SYSTEM_SETTINGS
} = require('./mockData');
const { ROLES, listPermissions, hasPermission } = require('./permissions');

// Deep-clone the mock arrays so writes don't mutate module-cached fixtures.
const state = {
  team:       MOCK_TEAM_MEMBERS.map((m) => ({ ...m })),
  activity:   MOCK_ACTIVITY_LOG.map((a) => ({ ...a })),
  tasks:      MOCK_TASKS.map((t) => ({ ...t })),
  notes:      MOCK_NOTES.map((n) => ({ ...n, mentions: [...(n.mentions || [])] })),
  settings:   JSON.parse(JSON.stringify(MOCK_SYSTEM_SETTINGS))
};

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso() { return new Date().toISOString(); }

function logActivity({ actor, action, target_type, target_id, target_label, summary }) {
  const entry = {
    id: newId('act'),
    actor_id: actor?.id || 'system',
    actor_name: actor?.name || 'System',
    action,
    target_type: target_type || null,
    target_id: target_id || null,
    target_label: target_label || null,
    summary: summary || '',
    at: nowIso()
  };
  state.activity.unshift(entry);
  if (state.activity.length > 500) state.activity.length = 500;
  return entry;
}

// ─── Team members ───────────────────────────────────────────────────────────

function listTeamMembers({ includeInactive = true } = {}) {
  const rows = includeInactive
    ? state.team
    : state.team.filter((m) => m.status === 'active');
  return rows.map((m) => ({ ...m }));
}

function getTeamMember(id) {
  return state.team.find((m) => m.id === id) || null;
}

function inviteTeamMember({ name, email, role = 'staff', title = '', phone = null }, actor) {
  if (!email || !name) {
    const err = new Error('Name and email are required.');
    err.status = 400;
    throw err;
  }
  if (!ROLES[role]) {
    const err = new Error(`Unknown role: ${role}`);
    err.status = 400;
    throw err;
  }
  if (state.team.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    const err = new Error('A team member with that email already exists.');
    err.status = 409;
    throw err;
  }
  const member = {
    id: newId('tm'),
    name,
    email,
    phone,
    role,
    title,
    status: 'invited',
    avatar_color: ROLES[role].color,
    last_active_at: null,
    created_at: nowIso()
  };
  state.team.push(member);
  logActivity({
    actor,
    action: 'team.invited',
    target_type: 'team_member',
    target_id: member.id,
    target_label: member.name,
    summary: `Invited as ${ROLES[role].label}`
  });
  return member;
}

function updateTeamMember(id, patch, actor) {
  const member = state.team.find((m) => m.id === id);
  if (!member) {
    const err = new Error('Team member not found.');
    err.status = 404;
    throw err;
  }
  const writable = ['name', 'email', 'phone', 'title', 'role', 'status'];
  const changed = [];
  for (const key of writable) {
    if (patch[key] !== undefined && patch[key] !== member[key]) {
      if (key === 'role' && !ROLES[patch.role]) {
        const err = new Error(`Unknown role: ${patch.role}`);
        err.status = 400;
        throw err;
      }
      member[key] = patch[key];
      changed.push(key);
    }
  }
  if (patch.role && ROLES[patch.role]) {
    member.avatar_color = ROLES[patch.role].color;
  }
  if (changed.length) {
    logActivity({
      actor,
      action: 'team.updated',
      target_type: 'team_member',
      target_id: member.id,
      target_label: member.name,
      summary: `Updated ${changed.join(', ')}`
    });
  }
  return member;
}

function deactivateTeamMember(id, actor) {
  return updateTeamMember(id, { status: 'deactivated' }, actor);
}

function reactivateTeamMember(id, actor) {
  return updateTeamMember(id, { status: 'active' }, actor);
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

function listTasks({ status, assignee_id } = {}) {
  let rows = state.tasks.slice();
  if (status) rows = rows.filter((t) => t.status === status);
  if (assignee_id) rows = rows.filter((t) => t.assignee_id === assignee_id);
  return rows.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function tasksByStatus() {
  const buckets = { todo: [], in_progress: [], review: [], done: [] };
  for (const t of state.tasks) {
    if (buckets[t.status]) buckets[t.status].push({ ...t });
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      if (prio[a.priority] !== prio[b.priority]) return prio[a.priority] - prio[b.priority];
      return new Date(a.due_at || 0) - new Date(b.due_at || 0);
    });
  }
  return buckets;
}

function createTask(payload, actor) {
  if (!payload?.title) {
    const err = new Error('Title is required.');
    err.status = 400;
    throw err;
  }
  const assignee = payload.assignee_id ? getTeamMember(payload.assignee_id) : null;
  const task = {
    id: newId('task'),
    title: payload.title,
    description: payload.description || '',
    status: payload.status || 'todo',
    priority: payload.priority || 'medium',
    assignee_id: assignee?.id || null,
    assignee_name: assignee?.name || null,
    creator_id: actor?.id || null,
    creator_name: actor?.name || null,
    due_at: payload.due_at || null,
    related_type: payload.related_type || null,
    related_id: payload.related_id || null,
    related_label: payload.related_label || null,
    created_at: nowIso(),
    updated_at: nowIso(),
    comments_count: 0
  };
  state.tasks.unshift(task);
  logActivity({
    actor,
    action: 'task.created',
    target_type: 'task',
    target_id: task.id,
    target_label: task.title,
    summary: assignee ? `Assigned to ${assignee.name}` : 'Unassigned'
  });
  return task;
}

function updateTask(id, patch, actor) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) {
    const err = new Error('Task not found.');
    err.status = 404;
    throw err;
  }
  const writable = ['title', 'description', 'status', 'priority', 'due_at'];
  const changed = [];
  for (const key of writable) {
    if (patch[key] !== undefined && patch[key] !== task[key]) {
      task[key] = patch[key];
      changed.push(key);
    }
  }
  if (patch.assignee_id !== undefined && patch.assignee_id !== task.assignee_id) {
    const assignee = patch.assignee_id ? getTeamMember(patch.assignee_id) : null;
    task.assignee_id = assignee?.id || null;
    task.assignee_name = assignee?.name || null;
    logActivity({
      actor,
      action: 'task.assigned',
      target_type: 'task',
      target_id: task.id,
      target_label: task.title,
      summary: assignee ? `Assigned to ${assignee.name}` : 'Unassigned'
    });
  }
  if (changed.includes('status') && task.status === 'done') {
    logActivity({
      actor,
      action: 'task.completed',
      target_type: 'task',
      target_id: task.id,
      target_label: task.title,
      summary: `Marked done by ${actor?.name || 'someone'}`
    });
  } else if (changed.length) {
    logActivity({
      actor,
      action: 'task.updated',
      target_type: 'task',
      target_id: task.id,
      target_label: task.title,
      summary: `Updated ${changed.join(', ')}`
    });
  }
  task.updated_at = nowIso();
  return task;
}

function deleteTask(id, actor) {
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx < 0) {
    const err = new Error('Task not found.');
    err.status = 404;
    throw err;
  }
  const [removed] = state.tasks.splice(idx, 1);
  logActivity({
    actor,
    action: 'task.deleted',
    target_type: 'task',
    target_id: removed.id,
    target_label: removed.title,
    summary: 'Deleted'
  });
  return removed;
}

// ─── Notes ──────────────────────────────────────────────────────────────────

function listNotes({ target_type, target_id } = {}) {
  let rows = state.notes.slice();
  if (target_type) rows = rows.filter((n) => n.target_type === target_type);
  if (target_id) rows = rows.filter((n) => n.target_id === target_id);
  return rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function createNote(payload, actor) {
  if (!payload?.body) {
    const err = new Error('Note body is required.');
    err.status = 400;
    throw err;
  }
  const note = {
    id: newId('note'),
    author_id: actor?.id || null,
    author_name: actor?.name || 'Unknown',
    target_type: payload.target_type || 'general',
    target_id: payload.target_id || null,
    target_label: payload.target_label || null,
    body: payload.body,
    mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
    created_at: nowIso(),
    updated_at: nowIso(),
    pinned: !!payload.pinned
  };
  state.notes.unshift(note);
  logActivity({
    actor,
    action: 'note.created',
    target_type: note.target_type,
    target_id: note.target_id,
    target_label: note.target_label,
    summary: note.body.slice(0, 80)
  });
  return note;
}

function deleteNote(id, actor) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx < 0) {
    const err = new Error('Note not found.');
    err.status = 404;
    throw err;
  }
  const [removed] = state.notes.splice(idx, 1);
  logActivity({
    actor,
    action: 'note.deleted',
    target_type: removed.target_type,
    target_id: removed.target_id,
    target_label: removed.target_label,
    summary: 'Deleted note'
  });
  return removed;
}

function togglePinNote(id, actor) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) {
    const err = new Error('Note not found.');
    err.status = 404;
    throw err;
  }
  note.pinned = !note.pinned;
  note.updated_at = nowIso();
  logActivity({
    actor,
    action: note.pinned ? 'note.pinned' : 'note.unpinned',
    target_type: note.target_type,
    target_id: note.target_id,
    target_label: note.target_label,
    summary: note.pinned ? 'Pinned note' : 'Unpinned note'
  });
  return note;
}

// ─── Activity ───────────────────────────────────────────────────────────────

function listActivity({ limit = 100, action, actor_id } = {}) {
  let rows = state.activity.slice();
  if (action) rows = rows.filter((a) => a.action === action);
  if (actor_id) rows = rows.filter((a) => a.actor_id === actor_id);
  return rows.slice(0, limit);
}

// ─── Settings ───────────────────────────────────────────────────────────────

function getSettings() {
  return JSON.parse(JSON.stringify(state.settings));
}

function updateSettings(patch, actor) {
  const allowedTopLevel = [
    'auto_send_enabled',
    'voice_agent_enabled',
    'inbox_scan_interval_min',
    'daily_reminder_hour',
    'default_appointment_duration_min',
    'require_2fa',
    'allow_invite_sign_up'
  ];
  const changed = [];
  for (const key of allowedTopLevel) {
    if (patch[key] !== undefined && patch[key] !== state.settings[key]) {
      state.settings[key] = patch[key];
      changed.push(key);
    }
  }
  if (patch.branding && typeof patch.branding === 'object') {
    for (const k of Object.keys(patch.branding)) {
      if (state.settings.branding[k] !== patch.branding[k]) {
        state.settings.branding[k] = patch.branding[k];
        changed.push(`branding.${k}`);
      }
    }
  }
  if (changed.length) {
    logActivity({
      actor,
      action: 'system.setting_changed',
      target_type: 'setting',
      target_id: changed.join(','),
      target_label: 'System settings',
      summary: `Updated ${changed.join(', ')}`
    });
  }
  return getSettings();
}

function rotateApiKey(id, actor) {
  const key = state.settings.api_keys.find((k) => k.id === id);
  if (!key) {
    const err = new Error('API key not found.');
    err.status = 404;
    throw err;
  }
  const newLastFour = '••••' + Math.random().toString(36).slice(-4);
  key.last_four = newLastFour;
  key.created_at = nowIso();
  key.last_used_at = null;
  key.status = 'active';
  logActivity({
    actor,
    action: 'api_key.rotated',
    target_type: 'api_key',
    target_id: key.id,
    target_label: key.label,
    summary: `Rotated to ${newLastFour}`
  });
  return key;
}

// ─── Permissions / roles (read-only) ────────────────────────────────────────

function listRoles() {
  return Object.values(ROLES).map((r) => ({
    ...r,
    permissions: listPermissions()
      .filter((p) => p.roles.includes(r.key))
      .map((p) => p.key)
  }));
}

function permissionMatrix() {
  const roles = Object.keys(ROLES);
  return listPermissions().map((p) => ({
    key: p.key,
    roles: roles.reduce((acc, r) => { acc[r] = p.roles.includes(r); return acc; }, {})
  }));
}

module.exports = {
  state,
  logActivity,
  // team
  listTeamMembers,
  getTeamMember,
  inviteTeamMember,
  updateTeamMember,
  deactivateTeamMember,
  reactivateTeamMember,
  // tasks
  listTasks,
  tasksByStatus,
  createTask,
  updateTask,
  deleteTask,
  // notes
  listNotes,
  createNote,
  deleteNote,
  togglePinNote,
  // activity
  listActivity,
  // settings
  getSettings,
  updateSettings,
  rotateApiKey,
  // roles
  listRoles,
  permissionMatrix,
  hasPermission
};
