import React, { useEffect, useState } from 'react';
import StatCard from '../components/StatCard.jsx';
import AppointmentRow from '../components/AppointmentRow.jsx';
import {
  getAppointments,
  getAvailableSlots,
  getTodayAppointments,
  cancelAppointment,
  bookManually
} from '../lib/api.js';

export default function Appointments() {
  const [appts, setAppts] = useState([]);
  const [today, setToday] = useState({ todayCount: 0 });
  const [slots, setSlots] = useState([]);
  const [showSlots, setShowSlots] = useState(false);
  const [booking, setBooking] = useState(null);
  const [form, setForm] = useState({ clientName: '', clientEmail: '', clientPhone: '', topic: '' });

  async function refresh() {
    const [a, t, s] = await Promise.all([getAppointments(), getTodayAppointments(), getAvailableSlots()]);
    setAppts(a?.appointments || []);
    setToday(t || { todayCount: 0 });
    setSlots(s?.slots || []);
  }

  useEffect(() => { refresh(); }, []);

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
              Click a slot to book manually.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {slots.map((s, i) => (
                <button
                  key={i}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 14px' }}
                  onClick={() => setBooking(s)}
                >
                  <span style={{ fontWeight: 600, color: 'var(--gold-soft)' }}>{s.displayDate}</span>
                  <span className="text-muted mono" style={{ fontSize: '0.84rem' }}>{s.displayTime}</span>
                </button>
              ))}
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
