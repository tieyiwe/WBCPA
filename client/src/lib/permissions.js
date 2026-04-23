// ─────────────────────────────────────────────────────────────────────────────
// Client-side mirror of server permissions. Kept in sync manually; the server
// is always the source of truth — this file is purely for UI gating.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  owner:   { key: 'owner',   label: 'Owner',         rank: 100, color: '#c9a84c', description: 'Full access to everything including billing.' },
  admin:   { key: 'admin',   label: 'Administrator', rank: 80,  color: '#b0916b', description: 'Manages team, clients, agent, and system settings.' },
  manager: { key: 'manager', label: 'Manager',       rank: 60,  color: '#6d8ac7', description: 'Coordinates staff, assigns tasks, manages clients.' },
  staff:   { key: 'staff',   label: 'Staff',         rank: 40,  color: '#4ea58a', description: 'Handles day-to-day client work.' },
  viewer:  { key: 'viewer',  label: 'Viewer',        rank: 20,  color: '#7a7f8c', description: 'Read-only access to dashboards.' }
};

export const PERMISSIONS = {
  'dashboard.view':        ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'subscribers.view':      ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'calls.view':            ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'emails.view':           ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'appointments.view':     ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'subscribers.edit':      ['owner', 'admin', 'manager'],
  'subscribers.delete':    ['owner', 'admin'],
  'emails.respond':        ['owner', 'admin', 'manager', 'staff'],
  'appointments.book':     ['owner', 'admin', 'manager', 'staff'],
  'appointments.cancel':   ['owner', 'admin', 'manager'],
  'agent.view':            ['owner', 'admin', 'manager'],
  'agent.deploy':          ['owner', 'admin'],
  'notes.view':            ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'notes.create':          ['owner', 'admin', 'manager', 'staff'],
  'notes.delete.own':      ['owner', 'admin', 'manager', 'staff'],
  'notes.delete.any':      ['owner', 'admin'],
  'tasks.view':            ['owner', 'admin', 'manager', 'staff'],
  'tasks.create':          ['owner', 'admin', 'manager'],
  'tasks.assign':          ['owner', 'admin', 'manager'],
  'tasks.complete':        ['owner', 'admin', 'manager', 'staff'],
  'tasks.delete':          ['owner', 'admin'],
  'admin.view':            ['owner', 'admin', 'manager'],
  'team.view':             ['owner', 'admin', 'manager'],
  'team.invite':           ['owner', 'admin'],
  'team.edit':             ['owner', 'admin'],
  'team.deactivate':       ['owner', 'admin'],
  'team.delete':           ['owner'],
  'roles.view':            ['owner', 'admin', 'manager'],
  'roles.manage':          ['owner'],
  'activity.view':         ['owner', 'admin'],
  'activity.export':       ['owner'],
  'system.settings.view':  ['owner', 'admin'],
  'system.settings.edit':  ['owner', 'admin'],
  'integrations.manage':   ['owner', 'admin'],
  'api_keys.view':         ['owner', 'admin'],
  'api_keys.rotate':       ['owner'],
  'billing.view':          ['owner'],
  'billing.manage':        ['owner']
};

export function can(role, key) {
  if (!role || !key) return false;
  const allowed = PERMISSIONS[key];
  return !!allowed && allowed.includes(role);
}

export function roleLabel(role) {
  return ROLES[role]?.label || role || 'Unknown';
}
