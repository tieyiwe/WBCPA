import React, { useState } from 'react';
import { initials, formatPhone, formatDuration, timeAgo } from '../lib/utils.js';
import { requestCallback } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';

export default function CallItem({ call, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [calling, setCalling] = useState(false);
  const [callbackResult, setCallbackResult] = useState(null);
  const [topic, setTopic] = useState('');
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const { can } = useRole();

  const isOngoing = call.status === 'ongoing';
  const badges = [];
  if (call.direction === 'outbound') badges.push({ label: 'Outbound', cls: 'badge-gold' });
  if (call.booking_made) badges.push({ label: 'Booked', cls: 'badge-green' });
  if (call.transferred) badges.push({ label: 'Transferred', cls: 'badge-blue' });
  if (call.action_needed) badges.push({ label: 'Action Needed', cls: 'badge-red' });
  if (call.sms_sent) badges.push({ label: 'SMS Sent', cls: 'badge-muted' });

  const transcriptIsStructured = Array.isArray(call.transcript);
  const canCallBack = can('emails.respond') && call.caller_number;

  async function handleCallBack(e) {
    e.stopPropagation();
    if (!showTopicForm) {
      setShowTopicForm(true);
      setTopic('');
      return;
    }
    setCalling(true);
    setCallbackResult(null);
    const resp = await requestCallback(call.id || call.bland_call_id, {
      topic: topic || undefined
    });
    setCalling(false);
    setShowTopicForm(false);
    if (resp?.error) {
      setCallbackResult({ tone: 'error', text: resp.error });
    } else if (resp?.mock) {
      setCallbackResult({ tone: 'warning', text: resp.message || 'Mock — would dial now if Bland was configured.' });
    } else if (resp?.ok) {
      setCallbackResult({ tone: 'success', text: `Outbound call queued (Bland id: ${resp.call_id || 'pending'})` });
    }
    setTimeout(() => setCallbackResult(null), 6000);
  }

  return (
    <div className="list-item" onClick={() => setOpen(!open)} style={{ alignItems: 'flex-start', borderLeft: isOngoing ? '3px solid var(--error)' : undefined }}>
      <div className="avatar">{initials(call.client_name)}</div>
      <div className="body">
        <div className="row1">
          <div className="name">{call.client_name || 'Unknown Caller'}</div>
          <div className="phone">{formatPhone(call.caller_number)}</div>
          {isOngoing && (
            <span className="badge badge-urgent-pulse" style={{ background: 'rgba(184,58,38,0.15)', color: 'var(--error)', borderColor: 'rgba(184,58,38,0.45)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--error)', display: 'inline-block' }} /> Ongoing
            </span>
          )}
          {badges.map((b) => (
            <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>
          ))}
        </div>
        <div className="summary">{call.summary || 'No summary available.'}</div>
        <div className="meta">
          <span>{timeAgo(call.called_at)}</span>
          <span>·</span>
          <span>{formatDuration(call.duration_seconds)}</span>
          {call.recording_url && (
            <>
              <span>·</span>
              <a href={call.recording_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                Recording
              </a>
            </>
          )}
        </div>

        {/* Topics discussed */}
        {open && call.topics_discussed?.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {call.topics_discussed.map((t) => (
              <span key={t} className="badge badge-muted" style={{ fontSize: '0.74rem' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Transcript */}
        {open && call.transcript && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)' }}>
                Transcript
              </div>
              {call.transcript_translated && (
                <>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: 'rgba(63,122,175,0.14)', color: 'var(--info)', border: '1px solid rgba(63,122,175,0.4)'
                  }}>
                    🌐 Translated to English{call.transcript_language ? ` from ${langName(call.transcript_language)}` : ''}
                  </span>
                  <button className="btn btn-ghost" style={{ padding: '1px 8px', fontSize: '0.74rem' }}
                          onClick={(e) => { e.stopPropagation(); setShowOriginal((v) => !v); }}>
                    {showOriginal ? 'Show English' : 'Show original'}
                  </button>
                </>
              )}
            </div>
            {transcriptIsStructured ? (
              <div style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, maxHeight: 360, overflow: 'auto' }}>
                {call.transcript.map((turn, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 'none', width: 56, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', paddingTop: 2 }}>
                      {turn.at}
                    </div>
                    <div style={{ flex: 'none', width: 58 }}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 999,
                        background: turn.role === 'agent' ? 'rgba(201,168,76,0.15)' : 'rgba(96,165,250,0.15)',
                        color: turn.role === 'agent' ? 'var(--gold-soft)' : 'var(--info)'
                      }}>
                        {turn.role === 'caller' ? 'client' : turn.role}
                      </span>
                    </div>
                    <div style={{ flex: 1, fontSize: '0.88rem', lineHeight: 1.5 }}>
                      {showOriginal && turn.original_text ? turn.original_text : turn.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="prompt-box" style={{ maxHeight: 240 }}>
                {call.transcript}
              </div>
            )}
          </div>
        )}

        {/* Action row */}
        {open && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {canCallBack && !showTopicForm && (
              <button className="btn btn-gold" onClick={handleCallBack} disabled={calling}>
                {calling ? <><span className="spinner" /> Dialing…</> : '☏ Call back via agent'}
              </button>
            )}
            {showTopicForm && (
              <>
                <input
                  className="input"
                  placeholder="Why is the agent calling? (optional)"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  style={{ flex: 1, minWidth: 280 }}
                />
                <button className="btn btn-gold" onClick={handleCallBack} disabled={calling}>
                  {calling ? 'Dialing…' : 'Place call'}
                </button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setShowTopicForm(false); }}>
                  Cancel
                </button>
              </>
            )}
            {callbackResult && (
              <span className={`badge ${callbackResult.tone === 'success' ? 'badge-green' : callbackResult.tone === 'warning' ? 'badge-orange' : 'badge-red'}`}
                    style={{ maxWidth: 480 }}>
                {callbackResult.text}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const LANG_NAMES = {
  es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', it: 'Italian',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ru: 'Russian',
  hi: 'Hindi', vi: 'Vietnamese', tl: 'Tagalog', pl: 'Polish'
};
function langName(code) {
  return LANG_NAMES[code] || (code ? code.toUpperCase() : 'another language');
}
