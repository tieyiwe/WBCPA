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
export const getVoiceStats = () => request('/voice/stats');
export const getAgentPrompt = () => request('/voice/prompt');
export const deployAgent = () => request('/voice/deploy-agent', { method: 'POST' });

// ─── Calendar ────────────────────────────────────────────────────────────────
export const getAppointments = () => request('/calendar');
export const getAvailableSlots = () => request('/calendar/slots');
export const getTodayAppointments = () => request('/calendar/today');
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
