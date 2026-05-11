import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { miltonChat, miltonClearSession, miltonGetSession } from '../lib/api.js';
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
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Don't render the widget on the full-page Milton route (avoid duplicate UI)
  if (location.pathname.startsWith('/dashboard/milton')) return null;
  if (!can('milton.use')) return null;

  // Load session whenever the widget opens, so it stays in sync with the
  // full-page Milton view across navigation.
  useEffect(() => {
    if (!open) return;
    miltonGetSession().then((data) => {
      if (data?.session?.messages?.length) {
        setMessages(data.session.messages);
        setHasUnread(false);
      }
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

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

  // ── Closed: floating launcher button ─────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Milton chat"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 90,
          width: 60, height: 60, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, var(--gold) 0%, #b0916b 100%)',
          color: '#0a0d14', cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        M
        {hasUnread && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--error)', border: '2px solid var(--bg-canvas)'
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
          background: 'linear-gradient(135deg, var(--gold) 0%, #b0916b 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.9rem', fontWeight: 700, color: '#0a0d14'
        }}>M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Milton</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            Online · AI Tax Advisor
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
          <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 6 }}>Hi, I'm Milton 👋</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
              Ask me about a client, an IRS rule, a tax doc, or what to focus on right now.
            </div>
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
              color: input.trim() && !sending ? '#0a0d14' : 'var(--text-dim)',
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
      background: 'linear-gradient(135deg, var(--gold) 0%, #b0916b 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.72rem', fontWeight: 700, color: '#0a0d14'
    }}>M</div>
  );
}

function WidgetMessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  function renderContent(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let listItems = [];

    function flushList() {
      if (listItems.length) {
        elements.push(
          <ul key={`ul-${elements.length}`} style={{ paddingLeft: 16, margin: '4px 0' }}>
            {listItems.map((li, i) => <li key={i} style={{ marginBottom: 2 }}>{renderInline(li)}</li>)}
          </ul>
        );
        listItems = [];
      }
    }

    lines.forEach((line, i) => {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        flushList();
        elements.push(
          <div key={i} style={{ fontWeight: 700, fontSize: '0.86rem', marginTop: 8, marginBottom: 3, color: 'var(--gold-soft)' }}>
            {renderInline(line.replace(/^#+\s/, ''))}
          </div>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        listItems.push(line.slice(2));
      } else {
        flushList();
        if (line.trim() === '') elements.push(<div key={i} style={{ height: 4 }} />);
        else elements.push(<div key={i} style={{ marginBottom: 1 }}>{renderInline(line)}</div>);
      }
    });
    flushList();
    return elements;
  }

  function renderInline(text) {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      return part;
    });
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <SmallAvatar />}
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'var(--gold)' : 'var(--bg-elev-2)',
        color: isUser ? '#0a0d14' : 'inherit',
        borderRadius: isUser ? '10px 4px 10px 10px' : '4px 10px 10px 10px',
        padding: '8px 12px', fontSize: '0.82rem', lineHeight: 1.5
      }}>
        {renderContent(msg.content)}
      </div>
    </div>
  );
}
