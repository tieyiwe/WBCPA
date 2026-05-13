// ─────────────────────────────────────────────────────────────────────────────
// Escalation queue service — calls/emails the AI flagged for human review.
// Workers can claim (accept), release, and resolve escalations. Each action
// writes to the activity log so admins can audit handoffs.
// ─────────────────────────────────────────────────────────────────────────────

const { MOCK_REVIEW_QUEUE } = require('./mockData');
const { logActivity } = require('./adminService');

// Operate directly on MOCK_REVIEW_QUEUE so the legacy /api/emails/queue
// endpoint and the new /api/escalations endpoint stay in sync.
const state = {
  queue: MOCK_REVIEW_QUEUE
};

function nowIso() { return new Date().toISOString(); }

function listEscalations({ status, claimed_by_id, scope } = {}) {
  let rows = state.queue.slice();
  if (status) rows = rows.filter((r) => r.status === status);
  if (claimed_by_id) rows = rows.filter((r) => r.claimed_by_id === claimed_by_id);
  if (scope === 'open') rows = rows.filter((r) => r.status === 'open');
  if (scope === 'mine') rows = rows.filter((r) => r.claimed_by_id === claimed_by_id && r.status === 'claimed');
  if (scope === 'active') rows = rows.filter((r) => r.status !== 'resolved');
  return rows.sort((a, b) => {
    const order = { open: 0, claimed: 1, resolved: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const urg = { high: 0, medium: 1, low: 2 };
    if (urg[a.urgency] !== urg[b.urgency]) return urg[a.urgency] - urg[b.urgency];
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function summary({ actorId } = {}) {
  const open = state.queue.filter((r) => r.status === 'open').length;
  const claimed = state.queue.filter((r) => r.status === 'claimed').length;
  const mine = actorId ? state.queue.filter((r) => r.claimed_by_id === actorId && r.status === 'claimed').length : 0;
  const resolved24h = state.queue.filter((r) => {
    if (r.status !== 'resolved' || !r.resolved_at) return false;
    return Date.now() - new Date(r.resolved_at).getTime() < 86400000;
  }).length;
  return { open, claimed, mine, resolved_24h: resolved24h };
}

function getEscalation(id) {
  return state.queue.find((r) => r.id === id) || null;
}

function claim(id, actor) {
  const item = getEscalation(id);
  if (!item) {
    const err = new Error('Escalation not found.');
    err.status = 404;
    throw err;
  }
  if (item.status === 'resolved') {
    const err = new Error('This escalation is already resolved.');
    err.status = 409;
    throw err;
  }
  if (item.status === 'claimed' && item.claimed_by_id !== actor.id) {
    const err = new Error(`Already claimed by ${item.claimed_by_name}. Have them release it first.`);
    err.status = 409;
    throw err;
  }
  item.status = 'claimed';
  item.claimed_by_id = actor.id;
  item.claimed_by_name = actor.name;
  item.claimed_at = nowIso();
  logActivity({
    actor,
    action: 'escalation.claimed',
    target_type: 'escalation',
    target_id: item.id,
    target_label: item.subject,
    summary: `Accepted ${item.type} escalation for ${item.client_name}`
  });
  return item;
}

function release(id, actor) {
  const item = getEscalation(id);
  if (!item) {
    const err = new Error('Escalation not found.');
    err.status = 404;
    throw err;
  }
  if (item.claimed_by_id && item.claimed_by_id !== actor.id && actor.role !== 'owner' && actor.role !== 'admin') {
    const err = new Error('Only the assigned worker (or an admin) can release this.');
    err.status = 403;
    throw err;
  }
  item.status = 'open';
  const previousOwner = item.claimed_by_name;
  item.claimed_by_id = null;
  item.claimed_by_name = null;
  item.claimed_at = null;
  logActivity({
    actor,
    action: 'escalation.released',
    target_type: 'escalation',
    target_id: item.id,
    target_label: item.subject,
    summary: `Released back to the pool${previousOwner ? ` (was held by ${previousOwner})` : ''}`
  });
  return item;
}

function resolve(id, { resolution_notes }, actor) {
  const item = getEscalation(id);
  if (!item) {
    const err = new Error('Escalation not found.');
    err.status = 404;
    throw err;
  }
  if (item.status === 'resolved') {
    return item;
  }
  if (item.status === 'open') {
    // Auto-claim before resolving so we have a clear handoff record.
    item.claimed_by_id = actor.id;
    item.claimed_by_name = actor.name;
    item.claimed_at = nowIso();
  }
  if (item.claimed_by_id && item.claimed_by_id !== actor.id && actor.role !== 'owner' && actor.role !== 'admin') {
    const err = new Error('Only the assigned worker (or an admin) can resolve this.');
    err.status = 403;
    throw err;
  }
  item.status = 'resolved';
  item.resolved_by_id = actor.id;
  item.resolved_by_name = actor.name;
  item.resolved_at = nowIso();
  item.resolution_notes = resolution_notes || null;
  logActivity({
    actor,
    action: 'escalation.resolved',
    target_type: 'escalation',
    target_id: item.id,
    target_label: item.subject,
    summary: resolution_notes ? `Resolved: ${resolution_notes.slice(0, 100)}` : 'Resolved'
  });
  return item;
}

// Allow other services (the AI agent webhook) to push new escalations into
// the queue. Unused yet but exposed for the future.
function enqueue(payload) {
  const item = {
    id: `rq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type: payload.type || 'call',
    email_log_id: payload.email_log_id || null,
    call_log_id: payload.call_log_id || null,
    client_name: payload.client_name || 'Unknown',
    client_phone: payload.client_phone || null,
    client_email: payload.client_email || null,
    subject: payload.subject || 'Escalation',
    reason_flagged: payload.reason_flagged || '',
    urgency: payload.urgency || 'medium',
    status: 'open',
    claimed_by_id: null,
    claimed_by_name: null,
    claimed_at: null,
    resolved_by_id: null,
    resolved_by_name: null,
    resolved_at: null,
    resolution_notes: null,
    ai_handoff_summary: payload.ai_handoff_summary || '',
    // 'bland_agent' = mid-call/post-call from the AI voice agent (blinks).
    // 'manual' = staff-created (no blink). 'email_agent' = AI email triage.
    source: payload.source || 'bland_agent',
    created_at: nowIso()
  };
  state.queue.unshift(item);
  return item;
}

module.exports = {
  listEscalations,
  getEscalation,
  summary,
  claim,
  release,
  resolve,
  enqueue
};
