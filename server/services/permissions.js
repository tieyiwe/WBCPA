// ─────────────────────────────────────────────────────────────────────────────
// Role & permission model — shared between server and client.
// Keep this file dependency-free so it can be required from anywhere.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = {
  owner: {
    key: 'owner',
    label: 'Owner',
    rank: 100,
    description: 'Full access to everything including billing and ownership transfer.',
    color: '#c9a84c'
  },
  admin: {
    key: 'admin',
    label: 'Administrator',
    rank: 80,
    description: 'Manages team, clients, agent, and system settings. No billing access.',
    color: '#b0916b'
  },
  manager: {
    key: 'manager',
    label: 'Manager',
    rank: 60,
    description: 'Coordinates staff, assigns tasks, manages clients and appointments.',
    color: '#6d8ac7'
  },
  staff: {
    key: 'staff',
    label: 'Staff',
    rank: 40,
    description: 'Handles day-to-day client work: calls, emails, scheduling.',
    color: '#4ea58a'
  },
  viewer: {
    key: 'viewer',
    label: 'Viewer',
    rank: 20,
    description: 'Read-only access to dashboards and reports.',
    color: '#7a7f8c'
  }
};

// Permissions are scoped keys. Each key lists the roles that hold it.
const PERMISSIONS = {
  // Read-access to primary pages
  'dashboard.view':        ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'subscribers.view':      ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'calls.view':            ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'emails.view':           ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'appointments.view':     ['owner', 'admin', 'manager', 'staff', 'viewer'],

  // Write actions on client-facing data
  'subscribers.edit':      ['owner', 'admin', 'manager'],
  'subscribers.delete':    ['owner', 'admin'],
  'emails.respond':        ['owner', 'admin', 'manager', 'staff'],
  'appointments.book':     ['owner', 'admin', 'manager', 'staff'],
  'appointments.cancel':   ['owner', 'admin', 'manager'],

  // Agent config
  'agent.view':            ['owner', 'admin', 'manager'],
  'agent.deploy':          ['owner', 'admin'],

  // Collaboration
  'notes.view':            ['owner', 'admin', 'manager', 'staff', 'viewer'],
  'notes.create':          ['owner', 'admin', 'manager', 'staff'],
  'notes.delete.own':      ['owner', 'admin', 'manager', 'staff'],
  'notes.delete.any':      ['owner', 'admin'],
  'tasks.view':            ['owner', 'admin', 'manager', 'staff'],
  'tasks.create':          ['owner', 'admin', 'manager'],
  'tasks.assign':          ['owner', 'admin', 'manager'],
  'tasks.complete':        ['owner', 'admin', 'manager', 'staff'],
  'tasks.delete':          ['owner', 'admin'],

  // Admin panel access
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

function hasPermission(role, key) {
  if (!role || !key) return false;
  const allowed = PERMISSIONS[key];
  if (!allowed) return false;
  return allowed.includes(role);
}

function rolesWith(key) {
  return PERMISSIONS[key] || [];
}

function listPermissions() {
  return Object.keys(PERMISSIONS).map((key) => ({
    key,
    roles: PERMISSIONS[key]
  }));
}

function assertPermission(role, key) {
  if (!hasPermission(role, key)) {
    const err = new Error(`Role "${role}" lacks permission "${key}"`);
    err.status = 403;
    throw err;
  }
}

module.exports = {
  ROLES,
  PERMISSIONS,
  hasPermission,
  rolesWith,
  listPermissions,
  assertPermission
};
