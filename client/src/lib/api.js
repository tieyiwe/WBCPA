// ─────────────────────────────────────────────────────────────────────────────
// Frontend API client — all fetch() calls to /api/*
// Includes Authorization header from localStorage if present. Every call is
// wrapped to never throw unhandled — returns { error } on failure.
// ─────────────────────────────────────────────────────────────────────────────

import { getCurrentDemoRole } from './roleContext.jsx';

const BASE = '/api';

function authHeaders() {
  const token = localStorage.getItem('wbcpa_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function demoHeaders() {
  const role = getCurrentDemoRole();
  return role ? { 'x-demo-role': role } : {};
}

async function request(path, options = {}) {
  try {
    const resp = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...demoHeaders(),
        ...(options.headers || {})
      }
    });

    const ct = resp.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await resp.json() : await resp.text();

    if (!resp.ok) {
      const message = (data && data.error) || resp.statusText || 'Request failed';
      return { error: message, status: resp.status };
    }
    return data;
  } catch (err) {
    return { error: err.message || 'Network error' };
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const login = (email, password) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const logout = () => request('/auth/logout', { method: 'POST' });
export const me = () => request('/auth/me');

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboard = () => request('/dashboard');

// ─── Subscribers ─────────────────────────────────────────────────────────────
export const getSubscribers = () => request('/subscribers');
export const getSubscriberStats = () => request('/subscribers/stats/overview');
export const getSubscriber = (id) => request(`/subscribers/${id}`);
export const createSubscriber = (data) =>
  request('/subscribers', { method: 'POST', body: JSON.stringify(data) });
export const updateSubscriber = (id, data) =>
  request(`/subscribers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ─── Voice ───────────────────────────────────────────────────────────────────
export const getCalls = (filter) =>
  request(`/voice/calls${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`);
export const getCallDetail = (id) => request(`/voice/calls/${id}`);
export const getVoiceStats = () => request('/voice/stats');
export const getAgentPrompt = () => request('/voice/prompt');
export const getConnectionStatus = () => request('/voice/connection');
export const deployAgent = () => request('/voice/deploy-agent', { method: 'POST' });
export const requestCallback = (callId, data = {}) =>
  request(`/voice/calls/${callId}/callback`, { method: 'POST', body: JSON.stringify(data) });
export const dialOutbound = (data) =>
  request('/voice/dial', { method: 'POST', body: JSON.stringify(data) });

// ─── Calendar ────────────────────────────────────────────────────────────────
export const getAppointments = () => request('/calendar');
export const getAvailableSlots = () => request('/calendar/slots');
export const getCalendarGrid = () => request('/calendar/grid');
export const getTodayAppointments = () => request('/calendar/today');
export const getAvailabilityConfig = () => request('/calendar/availability-config');
export const setAvailabilityConfig = (config) =>
  request('/calendar/availability-config', { method: 'PUT', body: JSON.stringify(config) });
export const bookManually = (data) =>
  request('/calendar/book-admin', { method: 'POST', body: JSON.stringify(data) });
export const cancelAppointment = (id, reason) =>
  request(`/calendar/cancel/${id}`, { method: 'POST', body: JSON.stringify({ reason }) });

// ─── Emails ──────────────────────────────────────────────────────────────────
export const getEmails = () => request('/emails');
export const getEmailQueue = () => request('/emails/queue');
export const resolveEmail = (id, reply, to, subject) =>
  request(`/emails/resolve/${id}`, { method: 'POST', body: JSON.stringify({ reply, to, subject }) });
export const syncInbox = () => request('/emails/sync', { method: 'POST' });

// ─── Clients ─────────────────────────────────────────────────────────────────
export const getClients = () => request('/clients');

// ─── Admin ───────────────────────────────────────────────────────────────────
export const getMe = () => request('/admin/me');

export const getTeam = () => request('/admin/team');
export const inviteTeamMember = (data) =>
  request('/admin/team', { method: 'POST', body: JSON.stringify(data) });
export const updateTeamMember = (id, patch) =>
  request(`/admin/team/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deactivateTeamMember = (id) =>
  request(`/admin/team/${id}/deactivate`, { method: 'POST' });
export const reactivateTeamMember = (id) =>
  request(`/admin/team/${id}/reactivate`, { method: 'POST' });

export const getRoles = () => request('/admin/roles');
export const getActivity = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/activity${qs ? `?${qs}` : ''}`);
};

export const getTaskBoard = () => request('/admin/tasks?view=board');
export const getTasks = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/tasks${qs ? `?${qs}` : ''}`);
};
export const createTask = (data) =>
  request('/admin/tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateTask = (id, patch) =>
  request(`/admin/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTask = (id) =>
  request(`/admin/tasks/${id}`, { method: 'DELETE' });

export const getNotes = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/admin/notes${qs ? `?${qs}` : ''}`);
};
export const createNote = (data) =>
  request('/admin/notes', { method: 'POST', body: JSON.stringify(data) });
export const pinNote = (id) =>
  request(`/admin/notes/${id}/pin`, { method: 'POST' });
export const deleteNote = (id) =>
  request(`/admin/notes/${id}`, { method: 'DELETE' });

export const getSettings = () => request('/admin/settings');
export const updateSettings = (patch) =>
  request('/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) });
export const rotateApiKey = (id) =>
  request(`/admin/settings/api-keys/${id}/rotate`, { method: 'POST' });

export const updateProfile = (patch) =>
  request('/admin/profile', { method: 'PATCH', body: JSON.stringify(patch) });
export const getMyWork = () => request('/admin/my-work');

// ─── Escalations ─────────────────────────────────────────────────────────────
export const getEscalations = (scope = 'active') =>
  request(`/escalations?scope=${encodeURIComponent(scope)}`);
export const getEscalationSummary = () => request('/escalations/summary');
export const claimEscalation = (id) =>
  request(`/escalations/${id}/claim`, { method: 'POST' });
export const releaseEscalation = (id) =>
  request(`/escalations/${id}/release`, { method: 'POST' });
export const resolveEscalation = (id, resolution_notes) =>
  request(`/escalations/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution_notes }) });
export const respondEscalation = (id, payload) =>
  request(`/escalations/${id}/respond`, { method: 'POST', body: JSON.stringify(payload) });

// ─── Tax Documents ────────────────────────────────────────────────────────────
export const getTaxDocs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/taxdocs${qs ? `?${qs}` : ''}`);
};
export const getTaxDoc = (id) => request(`/taxdocs/${id}`);
export const getTaxDocSummary = () => request('/taxdocs/summary');
export const uploadTaxDoc = (data) =>
  request('/taxdocs', { method: 'POST', body: JSON.stringify(data) });
export const processTaxDoc = (id) =>
  request(`/taxdocs/${id}/process`, { method: 'POST' });
export const approveTaxDoc = (id) =>
  request(`/taxdocs/${id}/approve`, { method: 'POST' });
export const rejectTaxDoc = (id, reason) =>
  request(`/taxdocs/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const sendTaxDocForSignature = (id) =>
  request(`/taxdocs/${id}/send-for-signature`, { method: 'POST' });
export const recordTaxDocSigned = (id) =>
  request(`/taxdocs/${id}/record-signed`, { method: 'POST' });
export const markTaxDocFiled = (id) =>
  request(`/taxdocs/${id}/mark-filed`, { method: 'POST' });
export const addTaxDocNote = (id, note) =>
  request(`/taxdocs/${id}/note`, { method: 'POST', body: JSON.stringify({ note }) });

// Bulk upload + assignment + complexity
export const bulkUploadTaxDocs = (payload) =>
  request('/taxdocs/bulk', { method: 'POST', body: JSON.stringify(payload) });
export const assignTaxDoc = (id, assignee_id, assignee_name) =>
  request(`/taxdocs/${id}/assign`, { method: 'POST', body: JSON.stringify({ assignee_id, assignee_name }) });
export const getTaxDocClients = () => request('/taxdocs/clients');
export const getTaxDocComplexity = (id) => request(`/taxdocs/${id}/complexity`);
export const getClientTaxComplexity = (clientId) => request(`/taxdocs/clients/${clientId}/complexity`);

// Secure client upload portal (staff)
export const createUploadLink = (payload) =>
  request('/taxdocs/upload-link', { method: 'POST', body: JSON.stringify(payload) });
export const listUploadLinks = () => request('/taxdocs/upload-links');
export const revokeUploadLink = (token) =>
  request(`/taxdocs/upload-link/${token}/revoke`, { method: 'POST' });

// Public client portal (no auth)
export const getPublicUploadInfo = (token) => request(`/public/upload/${token}`);
export const postPublicUpload = (token, files) =>
  request(`/public/upload/${token}`, { method: 'POST', body: JSON.stringify({ files }) });

// ─── Milton AI Agent ───────────────────────────────────────────────────────────
export const miltonChat = (message) =>
  request('/milton/chat', { method: 'POST', body: JSON.stringify({ message }) });
export const miltonClearSession = () =>
  request('/milton/chat', { method: 'DELETE' });
export const miltonGetSession = () => request('/milton/session');
export const miltonGetNudges = () => request('/milton/nudges');

// ─── Internal Chat ───────────────────────────────────────────────────────────
export const chatMembers = () => request('/chat/members');
export const chatConversations = () => request('/chat/conversations');
export const chatDiscover = () => request('/chat/discover');
export const chatMessages = (id) => request(`/chat/conversations/${id}/messages`);
export const chatSend = (id, body, reply_to) =>
  request(`/chat/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ body, reply_to }) });
export const chatEdit = (msgId, body) =>
  request(`/chat/messages/${msgId}`, { method: 'PATCH', body: JSON.stringify({ body }) });
export const chatDelete = (msgId) =>
  request(`/chat/messages/${msgId}`, { method: 'DELETE' });
export const chatCreateChannel = (data) =>
  request('/chat/channels', { method: 'POST', body: JSON.stringify(data) });
export const chatCreateGroup = (data) =>
  request('/chat/groups', { method: 'POST', body: JSON.stringify(data) });
export const chatOpenDM = (member_id) =>
  request('/chat/dm', { method: 'POST', body: JSON.stringify({ member_id }) });
export const chatJoinChannel = (id) =>
  request(`/chat/conversations/${id}/join`, { method: 'POST' });
export const chatAddMembers = (id, member_ids) =>
  request(`/chat/conversations/${id}/members`, { method: 'POST', body: JSON.stringify({ member_ids }) });
