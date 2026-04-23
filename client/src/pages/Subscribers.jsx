import React, { useEffect, useState } from 'react';
import { getSubscribers, getSubscriberStats, createSubscriber, updateSubscriber } from '../lib/api.js';
import StatCard from '../components/StatCard.jsx';
import SubscriberRow from '../components/SubscriberRow.jsx';

export default function Subscribers() {
  const [subs, setSubs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', tier: 'standard', status: 'active' });

  async function refresh() {
    setLoading(true);
    const [a, b] = await Promise.all([getSubscribers(), getSubscriberStats()]);
    setSubs(a?.subscribers || []);
    setStats(b || null);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.phone) return;
    await createSubscriber(form);
    setCreating(false);
    setForm({ name: '', email: '', phone: '', tier: 'standard', status: 'active' });
    refresh();
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editing) return;
    await updateSubscriber(editing.id, {
      tier: editing.tier,
      status: editing.status,
      notes: editing.notes
    });
    setEditing(null);
    refresh();
  }

  const premiumCount = (stats?.tiers?.premium || 0) + (stats?.tiers?.vip || 0);

  return (
    <div className="page">
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard icon="◆" tone="green" label="Active" value={stats?.active ?? 0} sub={`${stats?.total ?? 0} total`} />
        <StatCard icon="★" tone="gold" label="Premium + VIP" value={premiumCount} sub="Priority members" />
        <StatCard icon="⊘" tone="red" label="Expired" value={stats?.expired ?? 0} sub="Needs renewal" />
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>All Subscribers</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              {loading ? 'Loading…' : `${subs.length} member${subs.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <button className="btn btn-gold" onClick={() => setCreating(true)}>+ Add Subscriber</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Calls</th>
                <th>Last Call</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => <SubscriberRow key={s.id} sub={s} onEdit={setEditing} />)}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal onClose={() => setCreating(false)} title="Add Subscriber">
          <form onSubmit={handleCreate}>
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
            <Select label="Tier" value={form.tier} onChange={(v) => setForm({ ...form, tier: v })} options={['standard','premium','vip']} />
            <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={['active','trial','expired','cancelled']} />
            <div className="flex gap-sm mt-md">
              <button className="btn btn-gold" type="submit">Create</button>
              <button className="btn btn-ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={`Edit ${editing.name}`}>
          <form onSubmit={handleUpdate}>
            <Select label="Tier" value={editing.tier} onChange={(v) => setEditing({ ...editing, tier: v })} options={['standard','premium','vip']} />
            <Select label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })} options={['active','trial','expired','cancelled']} />
            <div className="form-group">
              <label>Notes</label>
              <textarea className="input" value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={3} />
            </div>
            <div className="flex gap-sm mt-md">
              <button className="btn btn-gold" type="submit">Save</button>
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <div className="form-group">
      <label>{label}{required && ' *'}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
