import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { miltonChat, miltonClearSession, miltonGetSession, miltonGetNudges } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';

// Floating Milton — appears on every dashboard page (except the full Milton page)
// and shares the same per-actor session with the full page, so a conversation
// started in one is visible from the other.

export default function MiltonWidget() {
  const { can } = useRole();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [nudges, setNudges] = useState({ nudges: [], count: 0, urgent_count: 0 });
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Derived gates (NOT early returns — those would change the hook count
  // between renders and crash React when navigating to /dashboard/milton).
  const onMiltonPage = location.pathname.startsWith('/dashboard/milton');
  const canUse = can('milton.use');
  const hidden = onMiltonPage || !canUse;

  // Load session whenever the widget opens, so it stays in sync with the
  // full-page Milton view across navigation.
  useEffect(() => {
    if (hidden || !open) return;
    miltonGetSession().then((data) => {
      if (data?.session?.messages?.length) {
        setMessages(data.session.messages);
        setHasUnread(false);
      }
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, hidden]);

  useEffect(() => {
    if (!hidden && open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, hidden]);

  // Personal nudge polling — drives the urgent-pulse state on the launcher.
  useEffect(() => {
    if (hidden) return;
    let mounted = true;
    async function tick() {
      const data = await miltonGetNudges().catch(() => null);
      if (mounted && data) setNudges(data);
    }
    tick();
    const interval = setInterval(tick, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, [hidden]);

  async function sendMessage(text) {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    const data = await miltonChat(msg);
    setSending(false);
    if (data?.error) {
      setError(data.error);
      setMessages((prev) => prev.slice(0, -1));
      return;
    }
    if (data?.messages) setMessages(data.messages);
    else if (data?.reply) setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function clearChat() {
    await miltonClearSession();
    setMessages([]);
  }

  // ── Render gate — placed AFTER every hook so the hook count is stable
  // across all routes. This is the only correct place to short-circuit.
  if (hidden) return null;

  // ── Closed: floating launcher button ─────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Milton chat"
        className={`milton-launcher${nudges.urgent_count > 0 ? ' milton-launcher-urgent' : ''}`}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 90,
          width: 64, height: 64, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #e8c97a 0%, #c9a84c 55%, #a88820 100%)',
          color: '#3a2c08', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 700,
          textShadow: '0 1px 1px rgba(255,255,255,0.35)'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title={nudges.count > 0 ? `${nudges.count} reminder${nudges.count === 1 ? '' : 's'} — open Milton` : 'Milton — your super agent'}
      >
        M
        {nudges.count > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            minWidth: 22, height: 22, padding: '0 6px',
            borderRadius: 999,
            background: nudges.urgent_count > 0 ? 'var(--error)' : 'var(--terracotta)',
            color: '#fff', border: '2px solid #fff',
            fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {nudges.count}
          </span>
        )}
        {hasUnread && nudges.count === 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--error)', border: '2px solid #fff'
          }} />
        )}
      </button>
    );
  }

  // ── Open: chat window anchored to bottom-right ──────────────────────────
  const empty = messages.length === 0;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 90,
      width: 'min(380px, calc(100vw - 40px))',
      height: 'min(600px, calc(100vh - 100px))',
      background: 'var(--bg-elev-1)', border: '1px solid var(--border)',
      borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: 'milton-pop-in 0.2s ease-out'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', background: 'var(--bg-elev-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flex: 'none'
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flex: 'none',
          background: 'linear-gradient(135deg, var(--gold) 0%, var(--olive-deep) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.9rem', fontWeight: 700, color: '#fff'
        }}>M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Milton</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            Online. I'm your super agent.
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="New conversation"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, fontSize: '0.95rem' }}
          >↺</button>
        )}
        <Link
          to="/dashboard/milton"
          title="Open full-page chat"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', padding: 4, fontSize: '0.95rem' }}
          onClick={() => setOpen(false)}
        >⇱</Link>
        <button
          onClick={() => setOpen(false)}
          title="Minimize"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, fontSize: '1rem' }}
        >✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: 'var(--bg-surface)' }}>
        {empty && (
          <div style={{ padding: '12px 0 8px' }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 6 }}>Hi, I'm Milton 👋</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Ask me about a client, an IRS rule, a tax doc, or what to focus on right now.
              </div>
            </div>

            {nudges.count > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: nudges.urgent_count ? 'var(--error)' : 'var(--gold)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
                  Your reminders ({nudges.count}{nudges.urgent_count ? ` · ${nudges.urgent_count} urgent` : ''})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nudges.nudges.slice(0, 5).map((n) => (
                    <a key={n.id} href={n.action_url}
                       style={{
                         display: 'flex', alignItems: 'flex-start', gap: 8,
                         padding: '8px 10px', borderRadius: 8, textDecoration: 'none',
                         background: n.severity === 'urgent' ? 'rgba(184,58,38,0.07)' : 'var(--bg-elev-2)',
                         border: `1px solid ${n.severity === 'urgent' ? 'rgba(184,58,38,0.35)' : 'var(--border)'}`,
                         color: 'var(--text)'
                       }}>
                      <span style={{ fontSize: '0.95rem', flex: 'none' }}>
                        {n.kind === 'task' ? '▤' : n.kind === 'escalation' ? '⚠' : n.kind === 'doc' ? '◧' : '☏'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{n.detail}</div>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                'What should I focus on right now?',
                'Show me open escalations',
                'Which docs are awaiting signature?',
                'Tell me about the Wealth Building Plan'
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{
                    background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                    color: 'var(--text)', fontSize: '0.82rem', textAlign: 'left'
                  }}
                >{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <WidgetMessageBubble key={i} msg={msg} />)}

        {sending && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <SmallAvatar />
            <div style={{ background: 'var(--bg-elev-2)', borderRadius: '4px 10px 10px 10px', padding: '8px 12px', display: 'flex', gap: 3, alignItems: 'center' }}>
              {[0, 1, 2].map((j) => (
                <span key={j} style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)',
                  animation: `typing-dot 1.2s infinite ${j * 0.2}s`
                }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.78rem', padding: 8, background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--bg-elev-1)', flex: 'none' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            className="input"
            style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 100, padding: '8px 10px', fontSize: '0.86rem', lineHeight: 1.4 }}
            rows={1}
            placeholder="Ask Milton…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            disabled={sending}
          />
          <button
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            style={{
              padding: '8px 12px', borderRadius: 8, border: 'none',
              background: input.trim() && !sending ? 'var(--gold)' : 'var(--bg-elev-2)',
              color: input.trim() && !sending ? '#fff' : 'var(--text-dim)',
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '0.84rem'
            }}
          >↑</button>
        </div>
      </div>
    </div>
  );
}

function SmallAvatar() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flex: 'none',
      background: 'linear-gradient(135deg, var(--gold) 0%, var(--olive-deep) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.72rem', fontWeight: 700, color: '#fff'
    }}>M</div>
  );
}

function WidgetMessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  function renderContent(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let bullets = [];
    let ordered = [];

    function flushBullets() {
      if (bullets.length) {
        elements.push(
          <ul key={`ul-${elements.length}`} style={{ paddingLeft: 18, margin: '3px 0' }}>
            {bullets.map((li, i) => <li key={i} style={{ marginBottom: 3, lineHeight: 1.45 }}>{renderInline(li)}</li>)}
          </ul>
        );
        bullets = [];
      }
    }
    function flushOrdered() {
      if (ordered.length) {
        elements.push(
          <ol key={`ol-${elements.length}`} style={{ paddingLeft: 20, margin: '3px 0' }}>
            {ordered.map((li, i) => <li key={i} style={{ marginBottom: 3, lineHeight: 1.45 }}>{renderInline(li)}</li>)}
          </ol>
        );
        ordered = [];
      }
    }
    function flushAll() { flushBullets(); flushOrdered(); }

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        flushAll();
        elements.push(
          <div key={i} style={{ fontWeight: 700, fontSize: '0.84rem', marginTop: elements.length ? 8 : 0, marginBottom: 3, color: 'var(--gold-soft)' }}>
            {renderInline(trimmed.replace(/^#+\s/, ''))}
          </div>
        );
      } else if (/^[-*]\s/.test(trimmed)) {
        flushOrdered();
        bullets.push(trimmed.slice(2));
      } else if (/^\d+[.)]\s/.test(trimmed)) {
        flushBullets();
        ordered.push(trimmed.replace(/^\d+[.)]\s/, ''));
      } else {
        flushAll();
        if (trimmed === '') elements.push(<div key={i} style={{ height: 6 }} />);
        else elements.push(<div key={i} style={{ marginBottom: 3, lineHeight: 1.5 }}>{renderInline(trimmed)}</div>);
      }
    });
    flushAll();
    return elements;
  }

  function renderInline(text) {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: 'var(--bg-elev-3)', padding: '1px 4px', borderRadius: 3, fontSize: '0.85em', fontFamily: 'var(--font-mono)' }}>{part.slice(1, -1)}</code>;
      return part;
    });
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <SmallAvatar />}
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'var(--gold)' : 'var(--bg-elev-2)',
        color: isUser ? '#fff' : 'inherit',
        borderRadius: isUser ? '10px 4px 10px 10px' : '4px 10px 10px 10px',
        padding: '8px 12px', fontSize: '0.82rem', lineHeight: 1.5
      }}>
        {renderContent(msg.content)}
      </div>
    </div>
  );
}
