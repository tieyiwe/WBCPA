import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe, updateProfile, getMyWork } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';
import RoleBadge from '../components/RoleBadge.jsx';
import { initials, timeAgo, formatPhone } from '../lib/utils.js';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'
];

const AVATAR_COLORS = ['#c9a84c', '#b0916b', '#6d8ac7', '#4ea58a', '#7a8399', '#d56c91', '#8d6cd5', '#5cb87a'];

export default function Profile() {
  const { role, roleDetail } = useRole();
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [work, setWork] = useState(null);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() {
    const [me, w] = await Promise.all([getMe(), getMyWork()]);
    if (me?.profile) {
      setProfile(me.profile);
      setEdits(me.profile);
    }
    if (me?.permissions) setPermissions(me.permissions);
    if (w?.counts) setWork(w);
  }

  useEffect(() => { refresh(); }, [role]);

  async function save(patch = edits) {
    setSaving(true);
    setError(null);
    const resp = await updateProfile(patch);
    setSaving(false);
    if (resp?.error) {
      setError(resp.error);
      return;
    }
    if (resp?.profile) {
      setProfile(resp.profile);
      setEdits(resp.profile);
      setSavedAt(new Date());
      setTimeout(() => setSavedAt(null), 2400);
    }
  }

  function update(key, value) {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  function updatePref(key, value) {
    setEdits((prev) => ({
      ...prev,
      notification_prefs: { ...(prev.notification_prefs || {}), [key]: value }
    }));
  }

  if (!profile) return <div className="page"><div className="card"><div className="empty">Loading profile…</div></div></div>;

  return (
    <div className="page">
      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Header card */}
      <div className="card" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="avatar" style={{
          width: 78, height: 78, fontSize: '1.6rem',
          background: edits.avatar_color || profile.avatar_color, color: '#fff',
          flex: 'none'
        }}>
          {initials(edits.name || profile.name)}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{edits.name || profile.name}</h2>
            <RoleBadge role={profile.role} size="lg" />
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{edits.title || profile.title || '—'}</div>
          <div style={{ color: 'var(--text-dim)', marginTop: 2, fontSize: '0.82rem' }}>
            {profile.email} · {edits.timezone || profile.timezone} · Member since {timeAgo(profile.created_at)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedAt && <span className="badge badge-green">Saved ✓</span>}
          <button className="btn btn-gold" onClick={() => save()} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
          </button>
        </div>
      </div>

      {/* My Work summary */}
      {work && (
        <div className="card mt-lg">
          <div className="card-title">My Work</div>
          <div className="card-sub">A quick look at what's on your plate right now.</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 14 }}>
            <Stat label="Open tasks"            value={work.counts.open_tasks}            link="/dashboard/admin/tasks" />
            <Stat label="Claimed escalations"   value={work.counts.claimed_escalations}   link="/dashboard/escalations?scope=mine" highlight={work.counts.claimed_escalations > 0} />
            <Stat label="Pool of open escalations" value={work.counts.pool_open_escalations} link="/dashboard/escalations" highlight={work.counts.pool_open_escalations > 0} />
            <Stat label="Tasks done (30d)"      value={work.counts.done_tasks_30d}        />
          </div>

          {work.open_tasks?.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)', marginBottom: 8 }}>
                Up next
              </div>
              {work.open_tasks.map((t) => (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${t.priority === 'high' ? 'badge-red' : t.priority === 'medium' ? 'badge-orange' : 'badge-muted'}`}>
                      {t.priority}
                    </span>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    {t.due_at && <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>· due {timeAgo(t.due_at)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {work.claimed_escalations?.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)', marginBottom: 8 }}>
                Escalations you've accepted
              </div>
              {work.claimed_escalations.map((e) => (
                <Link key={e.id} to="/dashboard/escalations?scope=mine" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600 }}>{e.subject}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{e.client_name} · accepted {timeAgo(e.claimed_at)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Personal info */}
      <div className="card mt-lg">
        <div className="card-title">Personal info</div>
        <div className="card-sub">This is what teammates see in mentions, call recaps, and the team directory.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          <Field label="Full name">
            <input className="input" value={edits.name || ''} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Title">
            <input className="input" value={edits.title || ''} onChange={(e) => update('title', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={edits.phone || ''} onChange={(e) => update('phone', e.target.value)} placeholder="+1…" />
          </Field>
          <Field label="Pronouns">
            <input className="input" value={edits.pronouns || ''} onChange={(e) => update('pronouns', e.target.value)} placeholder="she/her, he/him, they/them…" />
          </Field>
          <Field label="Timezone">
            <select className="input" value={edits.timezone || 'America/New_York'} onChange={(e) => update('timezone', e.target.value)}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
          <Field label="Avatar color">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', height: 36 }}>
              {AVATAR_COLORS.map((c) => (
                <button key={c} type="button"
                  onClick={() => update('avatar_color', c)}
                  style={{
                    width: 26, height: 26, borderRadius: 999,
                    background: c, cursor: 'pointer',
                    border: edits.avatar_color === c ? '2px solid var(--text)' : '1px solid var(--border)',
                    padding: 0
                  }}
                  aria-label={`Pick color ${c}`}
                />
              ))}
            </div>
          </Field>
        </div>

        <Field label="Bio" style={{ marginTop: 12 }}>
          <textarea className="input" rows={3} value={edits.bio || ''} onChange={(e) => update('bio', e.target.value)}
            placeholder="A short blurb teammates will see in your profile and mentions." />
        </Field>
      </div>

      {/* Notification preferences */}
      <div className="card mt-lg">
        <div className="card-title">Notification preferences</div>
        <div className="card-sub">Choose what reaches you outside the app. We never send anything to clients about you.</div>

        <div style={{ marginTop: 14 }}>
          <Toggle
            label="Email me when an escalation comes in"
            sub="The AI flags certain calls/emails for human review. Toggling this on means you get an email when one drops into the pool."
            checked={edits.notification_prefs?.email_escalations}
            onChange={(v) => updatePref('email_escalations', v)} />
          <Toggle
            label="SMS me high-urgency escalations"
            sub="Only for items the AI marked as 'high'. Requires a phone number on file."
            checked={edits.notification_prefs?.sms_escalations}
            onChange={(v) => updatePref('sms_escalations', v)} />
          <Toggle
            label="Notify me when I'm @mentioned"
            sub="In notes, tasks, or call summaries."
            checked={edits.notification_prefs?.mentions}
            onChange={(v) => updatePref('mentions', v)} />
          <Toggle
            label="Send me the daily digest"
            sub="A morning email summarizing what happened overnight: calls, bookings, escalations resolved."
            checked={edits.notification_prefs?.daily_digest}
            onChange={(v) => updatePref('daily_digest', v)} />
        </div>
      </div>

      {/* Permissions you have */}
      <div className="card mt-lg">
        <div className="card-title">What you can do</div>
        <div className="card-sub">Permissions granted to your role: <strong style={{ color: roleDetail.color }}>{roleDetail.label}</strong></div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 8,
          marginTop: 12,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem'
        }}>
          {permissions.map((p) => (
            <div key={p} style={{
              padding: '6px 10px',
              background: 'var(--bg-elev-2)',
              borderRadius: 6,
              color: 'var(--text-muted)'
            }}>
              {p}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, link, highlight }) {
  const inner = (
    <div className="card" style={{
      padding: 14,
      textAlign: 'center',
      background: highlight ? 'rgba(201,168,76,0.06)' : 'var(--bg-elev)',
      borderColor: highlight ? 'rgba(201,168,76,0.45)' : 'var(--border)'
    }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: highlight ? 'var(--gold-soft)' : 'var(--text)' }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>{label}</div>
    </div>
  );
  return link ? <Link to={link} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>{sub}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 999,
          background: checked ? 'var(--gold)' : 'var(--bg-elev-3)',
          border: '1px solid var(--border)',
          position: 'relative', cursor: 'pointer', flex: 'none'
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 18, height: 18, borderRadius: 999,
          background: checked ? '#fff' : 'var(--text)',
          transition: 'left 0.15s'
        }} />
      </button>
    </div>
  );
}
