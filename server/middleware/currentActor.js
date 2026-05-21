// ─────────────────────────────────────────────────────────────────────────────
// Resolves the current actor (team member + role) for admin routes.
//
// In production this reads from req.user (set by authGuard after JWT verify).
// In demo mode the client can pass `x-demo-role` and `x-demo-member-id` headers
// so the role switcher can preview what each role sees, without real auth.
// ─────────────────────────────────────────────────────────────────────────────

const { listTeamMembers } = require('../services/adminService');
const { ROLES, hasPermission } = require('../services/permissions');

function resolveActor(req) {
  const demoRole = req.headers['x-demo-role'];
  const demoId = req.headers['x-demo-member-id'];
  const team = listTeamMembers();

  if (demoId) {
    const m = team.find((t) => t.id === demoId);
    if (m) return { id: m.id, name: m.name, email: m.email, role: m.role };
  }

  if (demoRole && ROLES[demoRole]) {
    const m = team.find((t) => t.role === demoRole && t.status === 'active');
    if (m) return { id: m.id, name: m.name, email: m.email, role: m.role };
    return { id: `demo_${demoRole}`, name: `Demo ${ROLES[demoRole].label}`, email: null, role: demoRole };
  }

  if (req.user?.id && req.user?.role) {
    return { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role };
  }

  // Fallback: assume first owner so the panel is usable with zero config.
  const owner = team.find((t) => t.role === 'owner' && t.status === 'active') || team[0];
  return owner
    ? { id: owner.id, name: owner.name, email: owner.email, role: owner.role }
    : { id: 'demo-user', name: 'Demo User', email: null, role: 'owner' };
}

function attachActor(req, _res, next) {
  req.actor = resolveActor(req);
  next();
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    const actor = req.actor || resolveActor(req);
    req.actor = actor;
    if (!hasPermission(actor.role, permissionKey)) {
      return res.status(403).json({
        error: `Your role (${actor.role}) lacks permission: ${permissionKey}.`,
        required: permissionKey,
        actor_role: actor.role
      });
    }
    next();
  };
}

module.exports = { attachActor, requirePermission, resolveActor };
