import React, { useEffect, useState } from 'react';
import { getTeam, inviteTeamMember, updateTeamMember, deactivateTeamMember, reactivateTeamMember } from '../../lib/api.js';
import { useRole } from '../../lib/roleContext.jsx';
import { ROLES } from '../../lib/permissions.js';
import RoleBadge from '../../components/RoleBadge.jsx';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import { timeAgo, initials, formatPhone } from '../../lib/utils.js';

export default function TeamMembers() {
  const { can } = useRole();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null);

  if (!can('team.view')) return <AccessDenied permission="team.view" />;

  async function refresh() {
    setLoading(true);
    const data = await getTeam();
    if (data?.members) setMembers(data.members);
    if (data?.error) setError(data.error);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleInvite(form) {
    const resp = await inviteTeamMember(form);
    if (resp?.error) return setError(resp.error);
    setShowInvite(false);
    refresh();
  }

  async function handleUpdate(id, patch) {
    const resp = await updateTeamMember(id, patch);
    if (resp?.error) return setError(resp.error);
    setEditId(null);
    refresh();
  }

  async function handleDeactivate(id) {
    if (!confirm('Deactivate this member? They will lose access.')) return;
    const resp = await deactivateTeamMember(id);
    if (resp?.error) return setError(resp.error);
    refresh();
  }

  async function handleReactivate(id) {
    const resp = await reactivateTeamMember(id);
    if (resp?.error) return setError(resp.error);
    refresh();
  }

  const active = members.filter((m) => m.status === 'active');
  const invited = members.filter((m) => m.status === 'invited');
  const inactive = members.filter((m) => m.status === 'deactivated');

  return (
    <div>
      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginBottom: 14 }}>
          {error}
          <button className="btn btn-ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Team Members</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              {loading ? 'Loading…' : `${active.length} active · ${invited.length} invited · ${inactive.length} deactivated`}
            </div>
          </div>
          {can('team.invite') && (
            <button className="btn btn-gold" onClick={() => setShowInvite(true)}>+ Invite member</button>
          )}
        </div>

        <Section title="Active" members={active} editId={editId} setEditId={setEditId}
          onUpdate={handleUpdate} onDeactivate={handleDeactivate} can={can} />

        {invited.length > 0 && (
          <Section title="Pending invites" members={invited} editId={editId} setEditId={setEditId}
            onUpdate={handleUpdate} onDeactivate={handleDeactivate} can={can} />
        )}

        {inactive.length > 0 && (
          <Section title="Deactivated" members={inactive} editId={editId} setEditId={setEditId}
            onUpdate={handleUpdate} onReactivate={handleReactivate} can={can} deactivated />
        )}
      </div>

      {showInvite && <InviteModal onSubmit={handleInvite} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function Section({ title, members, editId, setEditId, onUpdate, onDeactivate, onReactivate, can, deactivated }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Role</th>
              <th>Contact</th>
              <th>Last active</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} style={{ opacity: deactivated ? 0.55 : 1 }}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ background: m.avatar_color || '#555', color: '#fff' }}>
                      {initials(m.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{m.email}</div>
                    </div>
                  </div>
                </td>
                <td>{m.title || '—'}</td>
                <td>
                  {editId === m.id && can('team.edit') ? (
                    <select
                      defaultValue={m.role}
                      onChange={(e) => onUpdate(m.id, { role: e.target.value })}
                      className="input"
                      style={{ padding: '4px 8px' }}
                    >
                      {Object.values(ROLES).map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {formatPhone(m.phone)}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {timeAgo(m.last_active_at)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {can('team.edit') && (
                    <button className="btn btn-ghost" onClick={() => setEditId(editId === m.id ? null : m.id)}>
                      {editId === m.id ? 'Done' : 'Edit'}
                    </button>
                  )}
                  {can('team.deactivate') && !deactivated && (
                    <button className="btn btn-ghost" style={{ color: 'var(--error)', marginLeft: 6 }} onClick={() => onDeactivate(m.id)}>
                      Deactivate
                    </button>
                  )}
                  {can('team.deactivate') && deactivated && onReactivate && (
                    <button className="btn btn-ghost" style={{ color: 'var(--success)', marginLeft: 6 }} onClick={() => onReactivate(m.id)}>
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteModal({ onSubmit, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', title: '', phone: '' });

  function submit(e) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card"
        style={{ width: 440, maxWidth: '92vw' }}
      >
        <div className="card-title">Invite team member</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>They'll receive a link to set their password.</div>

        <Field label="Full name">
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.values(ROLES).map((r) => (
              <option key={r.key} value={r.key}>{r.label} — {r.description}</option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-gold">Send invite</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
