import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getEscalations, claimEscalation, releaseEscalation, resolveEscalation, requestCallback } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';
import { AccessDenied } from '../components/PermissionGate.jsx';
import { timeAgo, initials, formatPhone } from '../lib/utils.js';

const SCOPES = [
  { key: 'active', label: 'Active queue', sub: 'Open + in-progress' },
  { key: 'open',   label: 'Unclaimed',    sub: 'Waiting for someone to accept' },
  { key: 'mine',   label: 'My escalations', sub: 'Items you have accepted' }
];

const URGENCY_BADGE = {
  high:   'badge-red',
  medium: 'badge-orange',
  low:    'badge-muted'
};

export default function Escalations() {
  const { can, role } = useRole();
  const [params, setParams] = useSearchParams();
  const initialScope = params.get('scope') || 'active';
  const [scope, setScope] = useState(initialScope);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ open: 0, claimed: 0, mine: 0, resolved_24h: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [recentlyAcceptedId, setRecentlyAcceptedId] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());

  const canView = can('emails.view') || can('calls.view');
  const prevIdsRef = useRef(new Set());

  async function refresh({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const data = await getEscalations(scope);
    if (data?.error) { setError(data.error); if (!silent) setLoading(false); return; }
    if (data?.items) {
      // Mark genuinely new items (only on silent/polled refreshes — not the
      // initial load, otherwise everything is "new")
      if (silent && prevIdsRef.current.size) {
        const fresh = new Set();
        for (const it of data.items) {
          if (!prevIdsRef.current.has(it.id)) fresh.add(it.id);
        }
        if (fresh.size) {
          setNewIds((prev) => {
            const merged = new Set(prev);
            fresh.forEach((id) => merged.add(id));
            return merged;
          });
          // Clear the "new" highlight after 12s
          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              fresh.forEach((id) => next.delete(id));
              return next;
            });
          }, 12000);
        }
      }
      prevIdsRef.current = new Set(data.items.map((i) => i.id));
      setItems(data.items);
    }
    if (data?.summary) setSummary(data.summary);
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    if (!canView) return;
    setParams({ scope }, { replace: true });
    refresh();
    // Live polling — workers see new escalations within 10s
    const interval = setInterval(() => refresh({ silent: true }), 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, canView]);

  // Render gate AFTER all hooks (preserves stable hook count)
  if (!canView) return <AccessDenied permission="emails.view" />;

  async function handleAccept(item) {
    if (!can('emails.respond')) return;
    setPendingId(item.id);
    const resp = await claimEscalation(item.id);
    setPendingId(null);
    if (resp?.error) {
      setError(resp.error);
      return;
    }
    // Flash the accepted state for ~1.5s before the row re-renders as claimed.
    setRecentlyAcceptedId(item.id);
    await refresh();
    setTimeout(() => setRecentlyAcceptedId((id) => (id === item.id ? null : id)), 1500);
  }

  async function handleRelease(item) {
    setPendingId(item.id);
    const resp = await releaseEscalation(item.id);
    setPendingId(null);
    if (resp?.error) setError(resp.error);
    else refresh();
  }

  async function handleResolve(item, notes) {
    setPendingId(item.id);
    const resp = await resolveEscalation(item.id, notes);
    setPendingId(null);
    if (resp?.error) setError(resp.error);
    else refresh();
  }

  async function handleCallBack(item) {
    if (!item.client_phone) return alert('No phone number on file for this client.');
    setPendingId(item.id);
    const resp = await requestCallback(item.call_log_id || 'manual', {
      phone: item.client_phone,
      clientName: item.client_name,
      topic: item.subject,
      previousSummary: item.ai_handoff_summary
    });
    setPendingId(null);
    if (resp?.error) return setError(resp.error);
    if (resp?.mock) alert(resp.message || 'Mock callback queued.');
    else if (resp?.ok) alert(`Outbound call queued. Bland call ID: ${resp.call_id || 'pending'}`);
  }

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Escalations</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              When the AI hands a call or email to a human, it lands here. Anyone with respond access can accept and take over.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <SummaryPill label="Unclaimed"   value={summary.open} color="var(--warning)" />
            <SummaryPill label="In progress" value={summary.claimed} color="var(--info)" />
            <SummaryPill label="Mine"        value={summary.mine} color="var(--gold-soft)" />
            <SummaryPill label="Resolved 24h" value={summary.resolved_24h} color="var(--success)" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCOPES.map((s) => (
            <button key={s.key}
              className={`btn ${scope === s.key ? 'btn-gold' : 'btn-ghost'}`}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              onClick={() => setScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginBottom: 14 }}>
          {error}
          <button className="btn btn-ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {loading && <div className="card"><div className="empty">Loading…</div></div>}

      {!loading && items.length === 0 && (
        <div className="card">
          <div className="empty">
            {scope === 'mine' ? "You haven't accepted any escalations yet." :
             scope === 'open' ? '✓ No unclaimed escalations — the queue is clear.' :
             '✓ Nothing active.'}
          </div>
        </div>
      )}

      {items.map((item) => (
        <EscalationCard
          key={item.id}
          item={item}
          can={can}
          role={role}
          pending={pendingId === item.id}
          recentlyAccepted={recentlyAcceptedId === item.id}
          isNew={newIds.has(item.id)}
          onAccept={handleAccept}
          onRelease={handleRelease}
          onResolve={handleResolve}
          onCallBack={handleCallBack}
        />
      ))}
    </div>
  );
}

function SummaryPill({ label, value, color }) {
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column',
      padding: '6px 12px', borderRadius: 8,
      background: `${color}15`, border: `1px solid ${color}55`,
      minWidth: 80, textAlign: 'center'
    }}>
      <span style={{ fontSize: '1.2rem', fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>{value}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
}

function EscalationCard({ item, can, role, pending, recentlyAccepted, isNew, onAccept, onRelease, onResolve, onCallBack }) {
  const [showResolve, setShowResolve] = useState(false);
  const [notes, setNotes] = useState('');
  const isResolved = item.status === 'resolved';
  const isClaimed = item.status === 'claimed';
  const accentColor = isResolved ? 'var(--success)' :
                      isClaimed ? 'var(--success)' :
                      item.urgency === 'high' ? 'var(--error)' : 'var(--warning)';

  return (
    <div className={`card ${isNew ? 'escalation-new' : ''}`}
         style={{ marginBottom: 12, borderColor: `${accentColor}55`, position: 'relative' }}>
      {isNew && (
        <span style={{
          position: 'absolute', top: 10, right: 14, zIndex: 2,
          background: 'var(--error)', color: '#fff',
          padding: '2px 8px', borderRadius: 10,
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', boxShadow: '0 0 0 4px rgba(184,58,38,0.18)'
        }}>● New</span>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{
          width: 4, alignSelf: 'stretch',
          background: accentColor, borderRadius: 4, flex: 'none',
          minHeight: 60
        }} />

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <span className={`badge ${URGENCY_BADGE[item.urgency]}`}>{item.urgency} urgency</span>
            <span className="badge badge-muted">{item.type}</span>
            {item.source === 'bland_agent' && (
              <span className="badge" style={{
                background: 'rgba(184,98,58,0.12)',
                color: 'var(--terracotta)',
                border: '1px solid rgba(184,98,58,0.4)',
                fontWeight: 600
              }}>📞 From Celine AI</span>
            )}
            {isClaimed && (
              <span className="badge badge-green">
                ✓ Accepted by {item.claimed_by_name}
              </span>
            )}
            {isResolved && (
              <span className="badge badge-green">Resolved by {item.resolved_by_name}</span>
            )}
            <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>· {timeAgo(item.created_at)}</span>
          </div>

          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>{item.subject}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            <strong style={{ color: 'var(--gold-soft)' }}>{item.client_name}</strong>
            {item.client_phone && <> · {formatPhone(item.client_phone)}</>}
            {item.client_email && <> · {item.client_email}</>}
          </div>

          {item.reason_flagged && (
            <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-elev-2)', borderRadius: 8, fontSize: '0.86rem' }}>
              <div style={{ color: 'var(--gold-soft)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Why escalated
              </div>
              {item.reason_flagged}
            </div>
          )}

          {item.ai_handoff_summary && (
            <div style={{ marginTop: 8, padding: 10, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, fontSize: '0.86rem', lineHeight: 1.55 }}>
              <div style={{ color: 'var(--info)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Agent's handoff summary
              </div>
              {item.ai_handoff_summary}
            </div>
          )}

          {isResolved && item.resolution_notes && (
            <div style={{ marginTop: 8, padding: 10, background: 'rgba(45,212,170,0.06)', border: '1px solid rgba(45,212,170,0.2)', borderRadius: 8, fontSize: '0.86rem' }}>
              <div style={{ color: 'var(--success)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Resolution
              </div>
              {item.resolution_notes}
              <div style={{ color: 'var(--text-dim)', fontSize: '0.74rem', marginTop: 4 }}>
                Resolved {timeAgo(item.resolved_at)}
              </div>
            </div>
          )}

          {item.call_log_id && (
            <div style={{ marginTop: 8 }}>
              <Link to={`/dashboard/calls?callId=${item.call_log_id}`} style={{ fontSize: '0.82rem', color: 'var(--gold-soft)' }}>
                ⇢ View original call (#{item.call_log_id})
              </Link>
            </div>
          )}
        </div>

        {!isResolved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160, alignItems: 'stretch' }}>
            {item.status === 'open' && can('emails.respond') && (
              <button
                className={`btn ${
                  recentlyAccepted
                    ? 'btn-accepted'
                    : item.source === 'bland_agent'
                      ? 'btn-gold btn-accept-blink'
                      : 'btn-gold'
                }`}
                onClick={() => onAccept(item)}
                disabled={pending}
              >
                {pending ? 'Accepting…' : recentlyAccepted ? '✓ Accepted!' : '✓ Accept & take over'}
              </button>
            )}
            {recentlyAccepted && isClaimed && (
              <button className="btn btn-accepted" disabled>
                ✓ Accepted!
              </button>
            )}

            {item.client_phone && can('emails.respond') && (
              <button className="btn btn-ghost" onClick={() => onCallBack(item)} disabled={pending}>
                ☏ Have agent call back
              </button>
            )}

            {isClaimed && (
              <>
                <button className="btn btn-ghost" onClick={() => setShowResolve(!showResolve)}>
                  {showResolve ? 'Cancel' : 'Resolve'}
                </button>
                <button className="btn btn-ghost" style={{ color: 'var(--text-muted)' }} onClick={() => onRelease(item)} disabled={pending}>
                  Release back to pool
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {showResolve && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Field label="Resolution notes (what did you do?)">
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Called the client, reconciled the 1099-K mismatch, drafted IRS response and scheduled review with Devon." />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setShowResolve(false); setNotes(''); }}>Cancel</button>
            <button className="btn btn-gold" onClick={() => { onResolve(item, notes); setShowResolve(false); setNotes(''); }} disabled={pending || !notes.trim()}>
              Mark resolved
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}
