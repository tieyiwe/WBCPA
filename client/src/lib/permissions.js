// ─────────────────────────────────────────────────────────────────────────────
// Client-side mirror of server permissions. Kept in sync manually; the server
// is always the source of truth — this file is purely for UI gating.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  super_owner: { key: 'super_owner', label: 'Super Owner',   rank: 120, color: '#5C6E2D', description: 'Technical owner — voice-agent deployment, integrations, API keys, infrastructure. Reserved for TIblogics.' },
  owner:       { key: 'owner',       label: 'Owner',         rank: 100, color: '#c9a84c', description: 'Firm owner — clients, team, billing. Technical infrastructure is handled by the Super Owner.' },
  admin:       { key: 'admin',       label: 'Administrator', rank: 80,  color: '#b0916b', description: 'Manages team and client work.' },
  manager:     { key: 'manager',     label: 'Manager',       rank: 60,  color: '#6d8ac7', description: 'Coordinates staff, assigns tasks, manages clients.' },
  staff:       { key: 'staff',       label: 'Staff',         rank: 40,  color: '#4ea58a', description: 'Handles day-to-day client work.' },
  viewer:      { key: 'viewer',      label: 'Viewer',        rank: 20,  color: '#7a7f8c', description: 'Read-only access to dashboards.' }
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
  'agent.view':            ['super_owner'],
  'agent.deploy':          ['super_owner'],
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
  'system.settings.view':  ['super_owner'],
  'system.settings.edit':  ['super_owner'],
  'integrations.manage':   ['super_owner'],
  'api_keys.view':         ['super_owner'],
  'api_keys.rotate':       ['super_owner'],
  'setup.view':            ['super_owner'],
  'billing.view':          ['owner'],
  'billing.manage':        ['owner'],
  'taxdocs.view':          ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'taxdocs.upload':        ['owner', 'admin', 'manager', 'staff'],
  'taxdocs.review':        ['owner', 'admin', 'manager', 'staff'],
  'taxdocs.approve':       ['owner', 'admin', 'manager'],
  'milton.use':            ['owner', 'admin', 'manager', 'staff', 'viewer']
};

export function can(role, key) {
  if (!role || !key) return false;
  // Super Owner (TIblogics) inherits everything — technical superuser.
  if (role === 'super_owner') return true;
  const allowed = PERMISSIONS[key];
  return !!allowed && allowed.includes(role);
}

export function roleLabel(role) {
  return ROLES[role]?.label || role || 'Unknown';
}
