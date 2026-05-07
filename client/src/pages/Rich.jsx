import React, { useEffect, useRef, useState } from 'react';
import { richChat, richClearSession, richGetSession } from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';
import { AccessDenied } from '../components/PermissionGate.jsx';

const SUGGESTED_PROMPTS = [
  { icon: '◈', text: 'Pull up Sarah Chen\'s profile and tell me her tax situation' },
  { icon: '✦', text: 'Which clients are good S-Corp candidates this year?' },
  { icon: '⚑', text: 'What documents are currently awaiting signature?' },
  { icon: '⚠', text: 'What escalations are currently open?' },
  { icon: '◉', text: 'Explain the QBI deduction and who qualifies' },
  { icon: '▣', text: 'Walk me through a 1031 exchange for a rental property client' }
];

export default function Rich() {
  const { can } = useRole();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  if (!can('rich.use')) return <AccessDenied permission="rich.use" />;

  useEffect(() => {
    richGetSession().then((data) => {
      if (data?.session?.messages?.length) {
        setMessages(data.session.messages);
      }
      setSessionLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    const data = await richChat(msg);
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
    await richClearSession();
    setMessages([]);
  }

  const empty = messages.length === 0;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: 0 }}>
      {/* Header */}
      <div className="card" style={{ marginBottom: 0, borderBottom: 'none', borderRadius: '12px 12px 0 0', flexShrink: 0 }}>
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--gold) 0%, #b0916b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', fontWeight: 700, color: '#0a0d14', flex: 'none'
            }}>R</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Rich</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                WBCPA's AI Tax Advisor · Access to all client data & IRS knowledge
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
          <div style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
              background: 'linear-gradient(135deg, var(--gold) 0%, #b0916b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', fontWeight: 700, color: '#0a0d14'
            }}>R</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>Hello, I'm Rich</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 28 }}>
              I'm WBCPA's AI tax advisor. I have access to your client database, call transcripts, tax documents,
              and a built-in IRS knowledge base. Ask me anything about a specific client, a tax strategy, or what's
              on your plate today.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, textAlign: 'left' }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  className="btn btn-ghost"
                  style={{ padding: '10px 14px', justifyContent: 'flex-start', gap: 8, fontSize: '0.84rem', lineHeight: 1.4 }}
                  onClick={() => sendMessage(p.text)}
                >
                  <span style={{ color: 'var(--gold)', flex: 'none' }}>{p.icon}</span>
                  {p.text}
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
            <RichAvatar />
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
            placeholder="Ask Rich anything — client tax situation, IRS questions, document status…"
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
          Press Enter to send · Shift+Enter for new line · Rich has access to all WBCPA data
        </div>
      </div>
    </div>
  );
}

function RichAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flex: 'none',
      background: 'linear-gradient(135deg, var(--gold) 0%, #b0916b 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.8rem', fontWeight: 700, color: '#0a0d14'
    }}>R</div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  // Simple markdown-ish rendering: bold **text**, headers ##, bullet lists
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
      {!isUser && <RichAvatar />}
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
        color: isUser ? '#0a0d14' : 'inherit',
        borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        padding: '10px 16px', fontSize: '0.9rem', lineHeight: 1.6
      }}>
        {renderContent(msg.content)}
      </div>
    </div>
  );
}
