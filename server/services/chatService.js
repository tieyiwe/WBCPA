// ─────────────────────────────────────────────────────────────────────────────
// Internal Chat Service — team messaging.
// Supports channels (public/private), direct messages, group chats,
// message editing within a time window, and threaded replies.
// In-memory mock store (no DB required).
// ─────────────────────────────────────────────────────────────────────────────

const { logActivity } = require('./adminService');

const nowIso = () => new Date().toISOString();
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

// How long after sending a message can the author still edit it.
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ── Seed conversations ───────────────────────────────────────────────────────
// type: 'channel' | 'dm' | 'group'
// visibility (channels only): 'public' | 'private'
// members: explicit member list for dm/group/private-channel. Public channels
//          have an implicit "everyone" membership but track joiners too.

const conversations = [
  {
    id: 'conv_general',
    type: 'channel',
    name: 'general',
    description: 'Company-wide announcements and chatter.',
    visibility: 'public',
    members: ['tm_000', 'tm_001', 'tm_002', 'tm_003', 'tm_004', 'tm_005', 'tm_006'],
    created_by_id: 'tm_001',
    created_by_name: 'Ebere Okoye',
    created_at: hoursAgo(720)
  },
  {
    id: 'conv_taxseason',
    type: 'channel',
    name: 'tax-season',
    description: 'Filing-season coordination, deadlines, and client triage.',
    visibility: 'public',
    members: ['tm_001', 'tm_002', 'tm_003', 'tm_004', 'tm_005'],
    created_by_id: 'tm_002',
    created_by_name: 'Angela Reyes',
    created_at: hoursAgo(240)
  },
  {
    id: 'conv_wins',
    type: 'channel',
    name: 'wins',
    description: 'Client wins, big refunds, and good news. 🎉',
    visibility: 'public',
    members: ['tm_001', 'tm_002', 'tm_003', 'tm_004'],
    created_by_id: 'tm_003',
    created_by_name: 'Devon Parker',
    created_at: hoursAgo(400)
  },
  {
    id: 'conv_leadership',
    type: 'channel',
    name: 'leadership',
    description: 'Private — owners and admins only.',
    visibility: 'private',
    members: ['tm_000', 'tm_001', 'tm_002'],
    created_by_id: 'tm_001',
    created_by_name: 'Ebere Okoye',
    created_at: hoursAgo(500)
  },
  {
    id: 'conv_dm_eb_dev',
    type: 'dm',
    name: null,
    members: ['tm_001', 'tm_003'],
    created_by_id: 'tm_001',
    created_by_name: 'Ebere Okoye',
    created_at: hoursAgo(50)
  }
];

const messages = [
  { id: 'msg_001', conversation_id: 'conv_general', author_id: 'tm_001', author_name: 'Ebere Okoye', body: 'Morning team — great push yesterday on the Q1 estimates. Keep it up. 🙌', reply_to: null, created_at: hoursAgo(6), edited_at: null, deleted: false },
  { id: 'msg_002', conversation_id: 'conv_general', author_id: 'tm_004', author_name: 'Maya Singh', body: 'Thanks Ebere! Closed out 4 returns before lunch.', reply_to: 'msg_001', created_at: hoursAgo(5), edited_at: null, deleted: false },
  { id: 'msg_003', conversation_id: 'conv_taxseason', author_id: 'tm_002', author_name: 'Angela Reyes', body: 'Reminder: March 15 S-Corp deadline is in 9 days. Anyone with pending 2553s, flag them in #tax-season today.', reply_to: null, created_at: hoursAgo(3), edited_at: minsAgo(170), deleted: false },
  { id: 'msg_004', conversation_id: 'conv_taxseason', author_id: 'tm_003', author_name: 'Devon Parker', body: 'Sarah Chen\'s 2553 is drafted, waiting on her signature. I\'ll chase it today.', reply_to: 'msg_003', created_at: hoursAgo(2), edited_at: null, deleted: false },
  { id: 'msg_005', conversation_id: 'conv_wins', author_id: 'tm_003', author_name: 'Devon Parker', body: 'Just saved a client $18,600 with a cost-seg study on their rental. 🎉', reply_to: null, created_at: hoursAgo(20), edited_at: null, deleted: false },
  { id: 'msg_006', conversation_id: 'conv_leadership', author_id: 'tm_001', author_name: 'Ebere Okoye', body: 'Let\'s review the new-hire plan after season. Adding two staff in May.', reply_to: null, created_at: hoursAgo(48), edited_at: null, deleted: false },
  { id: 'msg_007', conversation_id: 'conv_dm_eb_dev', author_id: 'tm_001', author_name: 'Ebere Okoye', body: 'Devon, can you take point on the O\'Connor K-1 issue? It needs senior eyes.', reply_to: null, created_at: hoursAgo(40), edited_at: null, deleted: false },
  { id: 'msg_008', conversation_id: 'conv_dm_eb_dev', author_id: 'tm_003', author_name: 'Devon Parker', body: 'On it. Already pulled the amended K-1 request.', reply_to: 'msg_007', created_at: hoursAgo(39), edited_at: null, deleted: false }
];

let _convCounter = 100;
let _msgCounter = 100;
const newConvId = () => `conv_${(++_convCounter).toString(36)}${Date.now().toString(36).slice(-4)}`;
const newMsgId = () => `msg_${(++_msgCounter).toString(36)}${Date.now().toString(36).slice(-4)}`;

// ── Membership helpers ───────────────────────────────────────────────────────
function isMember(conv, actorId) {
  if (conv.type === 'channel' && conv.visibility === 'public') return true;
  return conv.members.includes(actorId);
}

function teamMember(id) {
  try {
    const { listTeamMembers } = require('./adminService');
    return listTeamMembers().find((m) => m.id === id) || null;
  } catch { return null; }
}

// Build a display title for a conversation from the viewer's perspective.
function displayTitle(conv, actorId) {
  if (conv.type === 'channel') return `#${conv.name}`;
  if (conv.type === 'group') return conv.name || 'Group chat';
  // DM — show the OTHER person's name
  const otherId = conv.members.find((m) => m !== actorId) || conv.members[0];
  const m = teamMember(otherId);
  return m ? m.name : 'Direct message';
}

// ── Queries ──────────────────────────────────────────────────────────────────
function listConversations(actor) {
  const visible = conversations.filter((c) => isMember(c, actor.id));
  return visible.map((c) => {
    const convMsgs = messages.filter((m) => m.conversation_id === c.id && !m.deleted);
    const last = convMsgs[convMsgs.length - 1] || null;
    return {
      ...c,
      title: displayTitle(c, actor.id),
      member_count: c.type === 'channel' && c.visibility === 'public'
        ? c.members.length
        : c.members.length,
      last_message: last ? { body: last.body, author_name: last.author_name, created_at: last.created_at } : null,
      last_activity: last ? last.created_at : c.created_at
    };
  }).sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
}

function getConversation(id) {
  return conversations.find((c) => c.id === id) || null;
}

function listMessages(conversationId, actor) {
  const conv = getConversation(conversationId);
  if (!conv) { const e = new Error('Conversation not found.'); e.status = 404; throw e; }
  if (!isMember(conv, actor.id)) { const e = new Error('You are not a member of this conversation.'); e.status = 403; throw e; }
  const rows = messages.filter((m) => m.conversation_id === conversationId);
  // Attach the replied-to message snippet for rendering
  return rows.map((m) => {
    let reply_preview = null;
    if (m.reply_to) {
      const target = messages.find((x) => x.id === m.reply_to);
      if (target) reply_preview = { id: target.id, author_name: target.author_name, body: target.deleted ? '(deleted message)' : target.body };
    }
    return {
      ...m,
      reply_preview,
      can_edit: m.author_id === actor.id && !m.deleted && (Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS),
      edit_window_ms: EDIT_WINDOW_MS
    };
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────
function sendMessage(conversationId, { body, reply_to }, actor) {
  const conv = getConversation(conversationId);
  if (!conv) { const e = new Error('Conversation not found.'); e.status = 404; throw e; }
  if (!isMember(conv, actor.id)) { const e = new Error('You are not a member of this conversation.'); e.status = 403; throw e; }
  if (!body || !body.trim()) { const e = new Error('Message body required.'); e.status = 400; throw e; }
  if (reply_to && !messages.find((m) => m.id === reply_to && m.conversation_id === conversationId)) {
    const e = new Error('Replied-to message not found in this conversation.'); e.status = 400; throw e;
  }
  const msg = {
    id: newMsgId(),
    conversation_id: conversationId,
    author_id: actor.id,
    author_name: actor.name,
    body: body.trim(),
    reply_to: reply_to || null,
    created_at: nowIso(),
    edited_at: null,
    deleted: false
  };
  messages.push(msg);
  return msg;
}

function editMessage(messageId, { body }, actor) {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) { const e = new Error('Message not found.'); e.status = 404; throw e; }
  if (msg.author_id !== actor.id) { const e = new Error('You can only edit your own messages.'); e.status = 403; throw e; }
  if (msg.deleted) { const e = new Error('Cannot edit a deleted message.'); e.status = 409; throw e; }
  if (Date.now() - new Date(msg.created_at).getTime() > EDIT_WINDOW_MS) {
    const e = new Error('The edit window has passed (messages can be edited for 15 minutes after sending).'); e.status = 409; throw e;
  }
  if (!body || !body.trim()) { const e = new Error('Message body required.'); e.status = 400; throw e; }
  msg.body = body.trim();
  msg.edited_at = nowIso();
  return msg;
}

function deleteMessage(messageId, actor) {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) { const e = new Error('Message not found.'); e.status = 404; throw e; }
  const isAdmin = ['owner', 'admin', 'super_owner'].includes(actor.role);
  if (msg.author_id !== actor.id && !isAdmin) { const e = new Error('You can only delete your own messages.'); e.status = 403; throw e; }
  msg.deleted = true;
  msg.body = '';
  return msg;
}

function createChannel({ name, description, visibility, member_ids }, actor) {
  if (!name || !name.trim()) { const e = new Error('Channel name required.'); e.status = 400; throw e; }
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (conversations.some((c) => c.type === 'channel' && c.name === clean)) {
    const e = new Error(`A channel called #${clean} already exists.`); e.status = 409; throw e;
  }
  const members = visibility === 'private'
    ? Array.from(new Set([actor.id, ...(member_ids || [])]))
    : Array.from(new Set([actor.id, ...(member_ids || [])]));
  const conv = {
    id: newConvId(),
    type: 'channel',
    name: clean,
    description: description || '',
    visibility: visibility === 'private' ? 'private' : 'public',
    members,
    created_by_id: actor.id,
    created_by_name: actor.name,
    created_at: nowIso()
  };
  conversations.push(conv);
  logActivity({ actor, action: 'chat.channel_created', target_type: 'chat_channel', target_id: conv.id, target_label: `#${clean}`, summary: `Created ${conv.visibility} channel #${clean}` });
  return conv;
}

function createGroup({ name, member_ids }, actor) {
  const ids = Array.from(new Set([actor.id, ...(member_ids || [])]));
  if (ids.length < 2) { const e = new Error('A group needs at least one other member.'); e.status = 400; throw e; }
  const conv = {
    id: newConvId(),
    type: 'group',
    name: name?.trim() || ids.map((id) => (teamMember(id)?.name || '').split(' ')[0]).filter(Boolean).join(', '),
    members: ids,
    created_by_id: actor.id,
    created_by_name: actor.name,
    created_at: nowIso()
  };
  conversations.push(conv);
  return conv;
}

function openDirectMessage(otherId, actor) {
  if (otherId === actor.id) { const e = new Error('Cannot DM yourself.'); e.status = 400; throw e; }
  // Find existing DM between these two
  const existing = conversations.find((c) =>
    c.type === 'dm' && c.members.length === 2 && c.members.includes(actor.id) && c.members.includes(otherId)
  );
  if (existing) return existing;
  const conv = {
    id: newConvId(),
    type: 'dm',
    name: null,
    members: [actor.id, otherId],
    created_by_id: actor.id,
    created_by_name: actor.name,
    created_at: nowIso()
  };
  conversations.push(conv);
  return conv;
}

function joinChannel(conversationId, actor) {
  const conv = getConversation(conversationId);
  if (!conv) { const e = new Error('Conversation not found.'); e.status = 404; throw e; }
  if (conv.type !== 'channel') { const e = new Error('Only channels can be joined.'); e.status = 400; throw e; }
  if (conv.visibility === 'private') { const e = new Error('This is a private channel — ask a member to add you.'); e.status = 403; throw e; }
  if (!conv.members.includes(actor.id)) conv.members.push(actor.id);
  return conv;
}

function addMembers(conversationId, memberIds, actor) {
  const conv = getConversation(conversationId);
  if (!conv) { const e = new Error('Conversation not found.'); e.status = 404; throw e; }
  if (!isMember(conv, actor.id)) { const e = new Error('Only members can add others.'); e.status = 403; throw e; }
  for (const id of (memberIds || [])) {
    if (!conv.members.includes(id)) conv.members.push(id);
  }
  return conv;
}

// Public channels the actor hasn't joined yet (for discovery)
function discoverChannels(actor) {
  return conversations
    .filter((c) => c.type === 'channel' && c.visibility === 'public' && !c.members.includes(actor.id))
    .map((c) => ({ id: c.id, name: c.name, description: c.description, member_count: c.members.length }));
}

module.exports = {
  EDIT_WINDOW_MS,
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  createChannel,
  createGroup,
  openDirectMessage,
  joinChannel,
  addMembers,
  discoverChannels
};
