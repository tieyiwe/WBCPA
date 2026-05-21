import React, { useEffect, useState } from 'react';
import StatCard from '../components/StatCard.jsx';
import AppointmentRow from '../components/AppointmentRow.jsx';
import { useRole } from '../lib/roleContext.jsx';
import {
  getAppointments,
  getCalendarGrid,
  getTodayAppointments,
  cancelAppointment,
  bookManually,
  getAvailabilityConfig,
  setAvailabilityConfig
} from '../lib/api.js';

const DOW = [['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]];

export default function Appointments() {
  const { can } = useRole();
  const [appts, setAppts] = useState([]);
  const [today, setToday] = useState({ todayCount: 0 });
  const [slots, setSlots] = useState([]);
  const [showSlots, setShowSlots] = useState(false);
  const [booking, setBooking] = useState(null);
  const [form, setForm] = useState({ clientName: '', clientEmail: '', clientPhone: '', topic: '' });
  const [config, setConfig] = useState(null);
  const [showAvail, setShowAvail] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [blackoutInput, setBlackoutInput] = useState('');

  const canEditAvailability = can('appointments.cancel'); // owner/admin/manager

  async function refresh() {
    const [a, t, s, cfg] = await Promise.all([
      getAppointments(), getTodayAppointments(), getCalendarGrid(), getAvailabilityConfig()
    ]);
    setAppts(a?.appointments || []);
    setToday(t || { todayCount: 0 });
    setSlots(s?.slots || []);
    if (cfg?.config) setConfig(cfg.config);
  }

  useEffect(() => { refresh(); }, []);

  async function saveConfig(patch) {
    setSavingCfg(true);
    const resp = await setAvailabilityConfig({ ...config, ...patch });
    setSavingCfg(false);
    if (resp?.config) setConfig(resp.config);
    refresh();
  }

  function toggleDay(d) {
    if (!config) return;
    const days = config.working_days.includes(d)
      ? config.working_days.filter((x) => x !== d)
      : [...config.working_days, d].sort();
    saveConfig({ working_days: days });
  }

  async function handleCancel(appt) {
    if (!window.confirm(`Cancel appointment for ${appt.client_name}?`)) return;
    await cancelAppointment(appt.id, 'Cancelled by staff');
    refresh();
  }

  async function handleBook(e) {
    e.preventDefault();
    if (!booking) return;
    await bookManually({
      ...form,
      startTime: booking.start,
      topic: form.topic || 'CPA consultation'
    });
    setBooking(null);
    setForm({ clientName: '', clientEmail: '', clientPhone: '', topic: '' });
    refresh();
  }

  const weekCount = appts.filter((a) => {
    const d = new Date(a.scheduled_at);
    const cut = Date.now() + 7 * 86400000;
    return d.getTime() <= cut && d.getTime() >= Date.now();
  }).length;

  const bookedByAI = appts.filter((a) => !!a.call_log_id).length;

  return (
    <div className="page">
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard icon="▣" tone="gold" label="Today" value={today.todayCount} sub="Scheduled for today" />
        <StatCard icon="◷" tone="blue" label="This Week" value={weekCount} sub="Next 7 days" />
        <StatCard icon="✦" tone="green" label="Booked by AI" value={bookedByAI} sub="Converted from calls" />
      </div>

      {/* Owner availability settings */}
      {canEditAvailability && config && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="flex-between" style={{ cursor: 'pointer' }} onClick={() => setShowAvail(!showAvail)}>
            <div>
              <div className="card-title" style={{ marginBottom: 0 }}>Availability Settings</div>
              <div className="card-sub" style={{ marginTop: 2 }}>
                Control which days and hours clients (and the voice agent) can book. {savingCfg && '· Saving…'}
              </div>
            </div>
            <button className="btn btn-ghost">{showAvail ? 'Hide ▲' : 'Edit ▼'}</button>
          </div>

          {showAvail && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Working days */}
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>Working days</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DOW.map(([label, d]) => (
                    <button key={d} onClick={() => toggleDay(d)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                        border: `1px solid ${config.working_days.includes(d) ? 'var(--olive)' : 'var(--border)'}`,
                        background: config.working_days.includes(d) ? 'rgba(92,110,45,0.12)' : 'transparent',
                        color: config.working_days.includes(d) ? 'var(--olive)' : 'var(--text-muted)'
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hours + slot length */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <NumField label="Start hour (24h ET)" value={config.start_hour} min={0} max={23}
                  onSave={(v) => saveConfig({ start_hour: v })} />
                <NumField label="End hour (24h ET)" value={config.end_hour} min={1} max={24}
                  onSave={(v) => saveConfig({ end_hour: v })} />
                <SelField label="Slot length" value={config.slot_minutes} options={[15, 30, 45, 60]}
                  onSave={(v) => saveConfig({ slot_minutes: v })} suffix="min" />
                <NumField label="Book up to (days ahead)" value={config.days_ahead} min={1} max={90}
                  onSave={(v) => saveConfig({ days_ahead: v })} />
              </div>

              {/* Lunch break */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <NumField label="Lunch start (blank = none)" value={config.lunch_start ?? ''} min={0} max={23}
                  onSave={(v) => saveConfig({ lunch_start: v === '' ? null : v })} allowEmpty />
                <NumField label="Lunch end" value={config.lunch_end ?? ''} min={0} max={24}
                  onSave={(v) => saveConfig({ lunch_end: v === '' ? null : v })} allowEmpty />
              </div>

              {/* Blackout dates */}
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>Blackout dates (days off)</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {(config.blackout_dates || []).map((d) => (
                    <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'var(--bg-elev-2)', fontSize: '0.82rem' }}>
                      {d}
                      <button onClick={() => saveConfig({ blackout_dates: config.blackout_dates.filter((x) => x !== d) })}
                        style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer' }}>✕</button>
                    </span>
                  ))}
                  {(!config.blackout_dates || config.blackout_dates.length === 0) && <span className="text-muted" style={{ fontSize: '0.82rem' }}>None set</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="date" className="input" style={{ width: 'auto' }} value={blackoutInput} onChange={(e) => setBlackoutInput(e.target.value)} />
                  <button className="btn btn-ghost" disabled={!blackoutInput}
                    onClick={() => { saveConfig({ blackout_dates: [...(config.blackout_dates || []), blackoutInput] }); setBlackoutInput(''); }}>
                    + Add day off
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Upcoming Appointments</div>
            <div className="card-sub" style={{ marginTop: 2 }}>{appts.length} scheduled</div>
          </div>
          <button className="btn btn-gold" onClick={() => setShowSlots(!showSlots)}>
            {showSlots ? 'Hide' : 'Show'} Available Slots
          </button>
        </div>

        {showSlots && (
          <div style={{ marginBottom: 18 }}>
            <div className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 10 }}>
              Free slots are clickable. <span style={{ color: 'var(--error)' }}>Taken</span> slots are already booked and hidden from the agent.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {slots.map((s, i) => (
                <button
                  key={i}
                  className="btn btn-ghost"
                  disabled={s.taken}
                  style={{
                    justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 14px',
                    opacity: s.taken ? 0.5 : 1,
                    borderColor: s.taken ? 'var(--error)' : undefined,
                    cursor: s.taken ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => !s.taken && setBooking(s)}
                >
                  <span style={{ fontWeight: 600, color: s.taken ? 'var(--error)' : 'var(--gold-soft)' }}>
                    {s.displayDate}{s.taken ? ' · TAKEN' : ''}
                  </span>
                  <span className="text-muted mono" style={{ fontSize: '0.84rem' }}>{s.displayTime}</span>
                </button>
              ))}
              {slots.length === 0 && <div className="empty">No bookable slots — check your availability settings.</div>}
            </div>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Date & Time (ET)</th>
                <th>Topic</th>
                <th>Meet Link</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {appts.map((a) => <AppointmentRow key={a.id} appt={a} onCancel={handleCancel} />)}
              {appts.length === 0 && (
                <tr><td colSpan={6} className="empty">No appointments scheduled.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {booking && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
          onClick={() => setBooking(null)}
        >
          <form className="card" style={{ width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()} onSubmit={handleBook}>
            <div className="card-title">Book {booking.displayFull}</div>
            <div className="form-group">
              <label>Client Name</label>
              <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Client Email</label>
              <input className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Client Phone</label>
              <input className="input" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Topic</label>
              <input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="CPA consultation" />
            </div>
            <div className="flex gap-sm mt-md">
              <button className="btn btn-gold" type="submit">Book</button>
              <button className="btn btn-ghost" type="button" onClick={() => setBooking(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, min, max, onSave, allowEmpty }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <input
        className="input" type="number" min={min} max={max} value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === '' && allowEmpty) return onSave('');
          const n = Number(v);
          if (!Number.isNaN(n) && n >= min && n <= max) onSave(n);
          else setV(value);
        }}
      />
    </label>
  );
}

function SelField({ label, value, options, onSave, suffix }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <select className="input" value={value} onChange={(e) => onSave(Number(e.target.value))}>
        {options.map((o) => <option key={o} value={o}>{o}{suffix ? ` ${suffix}` : ''}</option>)}
      </select>
    </label>
  );
}
