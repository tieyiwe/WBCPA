import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CallItem from '../components/CallItem.jsx';
import { getCalls, dialOutbound } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';

const FILTERS = [
  { key: '',              label: 'All Calls' },
  { key: 'bookings',      label: 'Bookings Made' },
  { key: 'transferred',   label: 'Transferred' },
  { key: 'action_needed', label: 'Action Needed' }
];

export default function Calls() {
  const [params] = useSearchParams();
  const focusCallId = params.get('callId');
  const [filter, setFilter] = useState('');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDial, setShowDial] = useState(false);
  const { can } = useRole();

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const resp = await getCalls(filter);
      if (active) {
        setCalls(resp?.calls || []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [filter]);

  return (
    <div className="page">
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        {can('emails.respond') && (
          <button className="chip" onClick={() => setShowDial(true)}>
            ☏ Place outbound call
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-title">Call Log</div>
        <div className="card-sub">
          {loading ? 'Loading…' : `${calls.length} call${calls.length === 1 ? '' : 's'} shown · Click any row for transcript & call-back`}
        </div>
        {!loading && calls.length === 0 && <div className="empty">No calls match this filter.</div>}
        {calls.map((c) => (
          <CallItem
            key={c.id || c.bland_call_id}
            call={c}
            defaultOpen={focusCallId && (c.id === focusCallId || c.bland_call_id === focusCallId)}
          />
        ))}
      </div>

      {showDial && <OutboundDialModal onClose={() => setShowDial(false)} />}
    </div>
  );
}

function OutboundDialModal({ onClose }) {
  const [form, setForm] = useState({ phone: '', clientName: '', topic: '', previousSummary: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const resp = await dialOutbound(form);
    setBusy(false);
    if (resp?.error) setResult({ tone: 'error', text: resp.error });
    else if (resp?.mock) setResult({ tone: 'warning', text: resp.message || 'Mock — would dial now if Bland was configured.' });
    else if (resp?.ok) setResult({ tone: 'success', text: `Outbound call queued. Bland call_id: ${resp.call_id || 'pending'}` });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="card" style={{ width: 540, maxWidth: '94vw' }}>
        <div className="card-title">Place outbound call</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          The voice agent will call this number using your deployed prompt and tools.
        </div>

        <Field label="Phone (E.164 format)">
          <input className="input" required placeholder="+12025551234"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Client name (optional)">
          <input className="input"
            value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
        </Field>
        <Field label="Why is the agent calling?">
          <input className="input" required placeholder="e.g. Follow up on tax documents"
            value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
        </Field>
        <Field label="Previous context (optional)">
          <textarea className="input" rows={3}
            placeholder="What should the agent know going in?"
            value={form.previousSummary} onChange={(e) => setForm({ ...form, previousSummary: e.target.value })} />
        </Field>

        {result && (
          <div className={`badge ${result.tone === 'success' ? 'badge-green' : result.tone === 'warning' ? 'badge-orange' : 'badge-red'}`}
               style={{ marginTop: 10, maxWidth: '100%', whiteSpace: 'normal' }}>
            {result.text}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? <><span className="spinner" /> Dialing…</> : '☏ Place call'}
          </button>
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
