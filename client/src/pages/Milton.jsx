import React, { useEffect, useRef, useState } from 'react';
import { miltonChat, miltonClearSession, miltonGetSession, getEscalationSummary, getTaxDocSummary, getEmailQueue } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';
import { AccessDenied } from '../components/PermissionGate.jsx';

const SUGGESTED_PROMPTS = [
  { icon: '◈', text: 'Pull up Sarah Chen\'s profile and tell me her tax situation' },
  { icon: '✦', text: 'Which clients are good S-Corp candidates this year?' },
  { icon: '⚑', text: 'What documents are currently awaiting signature?' },
  { icon: '⚠', text: 'What escalations are currently open and what should I do first?' },
  { icon: '◉', text: 'Explain the QBI deduction and who qualifies' },
  { icon: '▣', text: 'Walk me through a 1031 exchange for a rental property client' },
  { icon: '☆', text: 'What does the Wealth Building Plan include and who is it for?' },
  { icon: '✎', text: 'Draft a CP2000 response for a client with a 1099-K mismatch' }
];

export default function Milton() {
  const { can } = useRole();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [pulse, setPulse] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const canUse = can('milton.use');

  useEffect(() => {
    if (!canUse) return;
    miltonGetSession().then((data) => {
      if (data?.session?.messages?.length) {
        setMessages(data.session.messages);
      }
      setSessionLoaded(true);
    });
  }, [canUse]);

  // Live workspace pulse — refreshes every 30s so Milton's empty state can
  // surface smart reminders the staff actually needs to act on.
  useEffect(() => {
    if (!canUse) return;
    async function loadPulse() {
      const [esc, docs, queue] = await Promise.all([
        getEscalationSummary().catch(() => null),
        getTaxDocSummary().catch(() => null),
        getEmailQueue().catch(() => null)
      ]);
      setPulse({
        open_escalations: esc?.summary?.open ?? 0,
        my_escalations: esc?.summary?.mine ?? 0,
        docs_pending_action: docs?.summary?.pending_action ?? 0,
        docs_awaiting_signature: docs?.summary?.awaiting_client ?? 0,
        email_review_queue: queue?.queue?.length ?? 0
      });
    }
    loadPulse();
    const interval = setInterval(loadPulse, 30000);
    return () => clearInterval(interval);
  }, [canUse]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render gate — AFTER all hooks. Conditional rendering must never change
  // the hook count between renders.
  if (!canUse) return <AccessDenied permission="milton.use" />;

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
    if (data?.messages) {
      setMessages(data.messages);
    } else if (data?.reply) {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function clearChat() {
    await miltonClearSession();
    setMessages([]);
  }

  const empty = messages.length === 0;

  // Smart reminder cards generated from the live workspace pulse
  const reminders = [];
  if (pulse?.open_escalations > 0) {
    reminders.push({
      icon: '⚠',
      tone: 'var(--error)',
      label: `${pulse.open_escalations} open escalation${pulse.open_escalations > 1 ? 's' : ''}`,
      prompt: 'Summarize each open escalation and recommend the order to handle them.'
    });
  }
  if (pulse?.docs_awaiting_signature > 0) {
    reminders.push({
      icon: '✍',
      tone: 'var(--warning)',
      label: `${pulse.docs_awaiting_signature} doc${pulse.docs_awaiting_signature > 1 ? 's' : ''} awaiting signature`,
      prompt: 'Which tax documents are awaiting client signature, and how long have they been waiting?'
    });
  }
  if (pulse?.docs_pending_action > 0) {
    reminders.push({
      icon: '◧',
      tone: 'var(--gold)',
      label: `${pulse.docs_pending_action} doc${pulse.docs_pending_action > 1 ? 's' : ''} need internal action`,
      prompt: 'Walk me through every tax document that needs internal review or approval right now.'
    });
  }
  if (pulse?.email_review_queue > 0) {
    reminders.push({
      icon: '✉',
      tone: 'var(--info)',
      label: `${pulse.email_review_queue} email${pulse.email_review_queue > 1 ? 's' : ''} in review queue`,
      prompt: 'What\'s in the email review queue right now? Anything urgent?'
    });
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: 0 }}>
      {/* Header */}
      <div className="card" style={{ marginBottom: 0, borderBottom: 'none', borderRadius: '12px 12px 0 0', flexShrink: 0 }}>
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <MiltonAvatar size={44} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Milton</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                WBCPA's AI Tax Advisor · Live view of clients, calls, docs, escalations · IRS + general finance knowledge
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem',
              color: 'var(--success)', background: 'rgba(45,212,170,0.1)', border: '1px solid rgba(45,212,170,0.25)',
              borderRadius: 20, padding: '4px 10px'
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              Online
            </span>
            {messages.length > 0 && (
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={clearChat}>
                ↺ New conversation
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderTop: 'none', borderBottom: 'none'
      }}>
        {empty && sessionLoaded && (
          <div style={{ maxWidth: 680, margin: '32px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <MiltonAvatar size={64} center />
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Hello, I'm Milton</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                WBCPA's in-app AI tax advisor. I have a live view of your clients, calls, tax documents, escalations,
                and the email queue — plus the firm knowledge base, IRS code, and general finance/CPA expertise.
                Ask me about a specific client, a tax strategy, an IRS question, or what you should focus on right now.
              </div>
            </div>

            {/* Smart reminders from the live pulse */}
            {reminders.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ color: 'var(--gold-soft)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Smart reminders · live from your workspace
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reminders.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => sendMessage(r.prompt)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                        padding: '10px 14px', borderRadius: 8,
                        background: `${r.tone}10`, border: `1px solid ${r.tone}55`,
                        color: 'var(--text)', cursor: 'pointer', fontSize: '0.88rem'
                      }}
                    >
                      <span style={{ color: r.tone, fontSize: '1.1rem', flex: 'none' }}>{r.icon}</span>
                      <span style={{ flex: 1 }}><strong style={{ color: r.tone }}>{r.label}</strong> — click to have Milton triage</span>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ color: 'var(--gold-soft)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Or try one of these
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  className="btn btn-ghost"
                  style={{ padding: '10px 14px', justifyContent: 'flex-start', gap: 8, fontSize: '0.84rem', lineHeight: 1.4, textAlign: 'left' }}
                  onClick={() => sendMessage(p.text)}
                >
                  <span style={{ color: 'var(--gold)', flex: 'none' }}>{p.icon}</span>
                  <span>{p.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {sending && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <MiltonAvatar size={32} />
            <div style={{
              background: 'var(--bg-elev-2)', borderRadius: '4px 12px 12px 12px',
              padding: '10px 16px', display: 'flex', gap: 4, alignItems: 'center'
            }}>
              {[0, 1, 2].map((j) => (
                <span key={j} style={{
                  width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)',
                  animation: `typing-dot 1.2s infinite ${j * 0.2}s`
                }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.84rem', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: '12px 16px', background: 'var(--bg-elev-1)',
        border: '1px solid var(--border)', borderTop: '1px solid var(--border)',
        borderRadius: '0 0 12px 12px', flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            className="input"
            style={{ flex: 1, resize: 'none', minHeight: 44, maxHeight: 140, lineHeight: 1.5 }}
            rows={1}
            placeholder="Ask Milton anything — a client, a tax strategy, an IRS question, or what to focus on right now…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            disabled={sending}
          />
          <button
            className="btn btn-gold"
            style={{ padding: '10px 18px', flex: 'none' }}
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
          >
            {sending ? <span className="spinner" /> : '↑ Send'}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          Press Enter to send · Shift+Enter for new line · Milton has live access to all WBCPA data
        </div>
      </div>
    </div>
  );
}

function MiltonAvatar({ size = 32, center = false }) {
  const fontSize = size >= 60 ? '1.8rem' : size >= 40 ? '1.2rem' : '0.85rem';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: 'linear-gradient(135deg, var(--gold) 0%, var(--olive-deep) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700, color: '#fff',
      margin: center ? '0 auto' : undefined
    }}>M</div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  function renderContent(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let listItems = [];

    function flushList() {
      if (listItems.length) {
        elements.push(
          <ul key={`ul-${elements.length}`} style={{ paddingLeft: 18, margin: '6px 0' }}>
            {listItems.map((li, i) => <li key={i} style={{ marginBottom: 3 }}>{renderInline(li)}</li>)}
          </ul>
        );
        listItems = [];
      }
    }

    lines.forEach((line, i) => {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        flushList();
        const level = line.startsWith('### ') ? 3 : 2;
        const txt = line.replace(/^#+\s/, '');
        elements.push(
          <div key={i} style={{ fontWeight: 700, fontSize: level === 2 ? '1rem' : '0.92rem', marginTop: 12, marginBottom: 4, color: 'var(--gold-soft)' }}>
            {renderInline(txt)}
          </div>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        listItems.push(line.slice(2));
      } else {
        flushList();
        if (line.trim() === '') {
          elements.push(<div key={i} style={{ height: 6 }} />);
        } else {
          elements.push(<div key={i} style={{ marginBottom: 2 }}>{renderInline(line)}</div>);
        }
      }
    });
    flushList();
    return elements;
  }

  function renderInline(text) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <MiltonAvatar size={32} />}
      {isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flex: 'none',
          background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600
        }}>You</div>
      )}
      <div style={{
        maxWidth: '72%', background: isUser ? 'var(--gold)' : 'var(--bg-elev-2)',
        color: isUser ? '#fff' : 'inherit',
        borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        padding: '10px 16px', fontSize: '0.9rem', lineHeight: 1.6
      }}>
        {renderContent(msg.content)}
      </div>
    </div>
  );
}
