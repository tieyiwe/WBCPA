import React, { useEffect, useRef, useState } from 'react';
import {
  chatConversations, chatMessages, chatSend, chatEdit, chatDelete,
  chatMembers, chatDiscover, chatCreateChannel, chatCreateGroup, chatOpenDM, chatJoinChannel
} from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';
import { AccessDenied } from '../components/PermissionGate.jsx';
import { timeAgo } from '../lib/utils.js';

export default function Chat() {
  const { can } = useRole();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null); // { id, body }
  const [error, setError] = useState(null);
  const [newMenu, setNewMenu] = useState(false);
  const [modal, setModal] = useState(null); // 'channel' | 'group' | 'dm' | 'discover'
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const canUse = can('chat.use');

  async function loadConversations(selectFirst = false) {
    const data = await chatConversations();
    if (data?.conversations) {
      setConversations(data.conversations);
      if (selectFirst && !activeId && data.conversations.length) setActiveId(data.conversations[0].id);
    }
  }

  async function loadMessages(id) {
    if (!id) return;
    const data = await chatMessages(id);
    if (data?.messages) setMessages(data.messages);
    if (data?.error) setError(data.error);
  }

  useEffect(() => { if (canUse) loadConversations(true); }, [canUse]);

  // Poll the active conversation + the list every 5s for near-real-time feel
  useEffect(() => {
    if (!canUse || !activeId) return;
    loadMessages(activeId);
    const interval = setInterval(() => { loadMessages(activeId); loadConversations(); }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, canUse]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!canUse) return <AccessDenied permission="chat.use" />;

  const active = conversations.find((c) => c.id === activeId) || null;

  async function send() {
    const body = input.trim();
    if (!body || !activeId) return;
    setInput('');
    const reply = replyTo?.id || null;
    setReplyTo(null);
    const resp = await chatSend(activeId, body, reply);
    if (resp?.error) { setError(resp.error); return; }
    await loadMessages(activeId);
  }

  async function saveEdit() {
    if (!editing?.body.trim()) return;
    const resp = await chatEdit(editing.id, editing.body.trim());
    if (resp?.error) { setError(resp.error); return; }
    setEditing(null);
    await loadMessages(activeId);
  }

  async function removeMessage(id) {
    const resp = await chatDelete(id);
    if (resp?.error) { setError(resp.error); return; }
    await loadMessages(activeId);
  }

  const channels = conversations.filter((c) => c.type === 'channel');
  const dms = conversations.filter((c) => c.type === 'dm');
  const groups = conversations.filter((c) => c.type === 'group');

  return (
    <div className="page" style={{ display: 'flex', gap: 0, height: 'calc(100vh - 92px)' }}>
      {/* Conversation sidebar */}
      <div style={{
        width: 260, flexShrink: 0, background: 'var(--bg-elev-1)',
        border: '1px solid var(--border)', borderRadius: '12px 0 0 12px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <div className="flex-between">
            <strong style={{ fontFamily: 'var(--font-display)' }}>Team Chat</strong>
            <button className="btn btn-gold" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setNewMenu((v) => !v)}>+ New</button>
          </div>
          {newMenu && (
            <div style={{ position: 'absolute', top: '100%', right: 12, zIndex: 30, background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', overflow: 'hidden', minWidth: 180 }}>
              {[
                ['channel', '＃ New channel'],
                ['group', '◇ New group chat'],
                ['dm', '✎ New direct message'],
                ['discover', '⌕ Browse channels']
              ].map(([k, label]) => (
                <button key={k} onClick={() => { setModal(k); setNewMenu(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '0.84rem' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <ConvGroup label="Channels" items={channels} activeId={activeId} onSelect={setActiveId} />
          <ConvGroup label="Direct messages" items={dms} activeId={activeId} onSelect={setActiveId} />
          <ConvGroup label="Group chats" items={groups} activeId={activeId} onSelect={setActiveId} />
        </div>
      </div>

      {/* Message thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 12px 12px 0', overflow: 'hidden' }}>
        {!active ? (
          <div className="empty" style={{ margin: 'auto' }}>Select a conversation, or start a new one.</div>
        ) : (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{active.title}</div>
              {active.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{active.description}</div>}
              {active.type === 'channel' && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: 2 }}>
                  {active.visibility === 'private' ? '🔒 Private channel' : '🌐 Public channel'} · {active.member_count} members
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {messages.length === 0 && <div className="empty">No messages yet. Say hello 👋</div>}
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  editing={editing?.id === m.id}
                  editBody={editing?.body}
                  onEditChange={(v) => setEditing({ id: m.id, body: v })}
                  onEditSave={saveEdit}
                  onEditCancel={() => setEditing(null)}
                  onStartEdit={() => setEditing({ id: m.id, body: m.body })}
                  onReply={() => { setReplyTo({ id: m.id, author_name: m.author_name, body: m.body }); inputRef.current?.focus(); }}
                  onDelete={() => removeMessage(m.id)}
                />
              ))}
              <div ref={endRef} />
            </div>

            {error && (
              <div style={{ padding: '6px 16px', color: 'var(--error)', fontSize: '0.82rem', background: 'rgba(184,58,38,0.06)' }}>
                {error} <button className="btn btn-ghost" style={{ marginLeft: 8, padding: '1px 8px', fontSize: '0.76rem' }} onClick={() => setError(null)}>Dismiss</button>
              </div>
            )}

            {/* Composer */}
            <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-elev-2)', borderRadius: '8px 8px 0 0', borderLeft: '3px solid var(--gold)', fontSize: '0.8rem' }}>
                  <span style={{ flex: 1, color: 'var(--text-muted)' }}>
                    Replying to <strong style={{ color: 'var(--text)' }}>{replyTo.author_name}</strong>: {replyTo.body.slice(0, 60)}{replyTo.body.length > 60 ? '…' : ''}
                  </span>
                  <button className="btn btn-ghost" style={{ padding: '1px 8px', fontSize: '0.78rem' }} onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  className="input"
                  style={{ flex: 1, resize: 'none', minHeight: 42, maxHeight: 140, lineHeight: 1.5 }}
                  rows={1}
                  placeholder={`Message ${active.title}`}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                />
                <button className="btn btn-gold" style={{ padding: '10px 18px' }} onClick={send} disabled={!input.trim()}>Send</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {modal === 'channel' && <ChannelModal onClose={() => setModal(null)} onCreated={async (c) => { setModal(null); await loadConversations(); setActiveId(c.id); }} />}
      {modal === 'group' && <GroupModal onClose={() => setModal(null)} onCreated={async (c) => { setModal(null); await loadConversations(); setActiveId(c.id); }} />}
      {modal === 'dm' && <DMModal onClose={() => setModal(null)} onCreated={async (c) => { setModal(null); await loadConversations(); setActiveId(c.id); }} />}
      {modal === 'discover' && <DiscoverModal onClose={() => setModal(null)} onJoined={async (c) => { setModal(null); await loadConversations(); setActiveId(c.id); }} />}
    </div>
  );
}

function ConvGroup({ label, items, activeId, onSelect }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ padding: '4px 16px', color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {items.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
            padding: '8px 16px', fontSize: '0.86rem',
            background: activeId === c.id ? 'var(--bg-elev-2)' : 'transparent',
            color: activeId === c.id ? 'var(--olive)' : 'var(--text)',
            fontWeight: activeId === c.id ? 600 : 400,
            borderLeft: `3px solid ${activeId === c.id ? 'var(--gold)' : 'transparent'}`
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.type === 'channel' ? (c.visibility === 'private' ? '🔒 ' : '# ') : c.type === 'group' ? '◇ ' : ''}{c.type === 'channel' ? c.name : c.title}
            </span>
          </div>
          {c.last_message && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
              {c.last_message.author_name?.split(' ')[0]}: {c.last_message.body}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function MessageRow({ msg, editing, editBody, onEditChange, onEditSave, onEditCancel, onStartEdit, onReply, onDelete }) {
  const [hover, setHover] = useState(false);
  if (msg.deleted) {
    return <div style={{ padding: '4px 0', color: 'var(--text-dim)', fontSize: '0.82rem', fontStyle: 'italic' }}>(message deleted)</div>;
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: '6px 0', position: 'relative' }}
    >
      {msg.reply_preview && (
        <div style={{ marginLeft: 2, marginBottom: 2, paddingLeft: 8, borderLeft: '2px solid var(--border-strong)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          ↩ <strong>{msg.reply_preview.author_name}</strong>: {msg.reply_preview.body.slice(0, 70)}{msg.reply_preview.body.length > 70 ? '…' : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ fontSize: '0.86rem', color: 'var(--gold-soft)' }}>{msg.author_name}</strong>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{timeAgo(msg.created_at)}{msg.edited_at ? ' · edited' : ''}</span>
        {hover && !editing && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost" style={{ padding: '0 6px', fontSize: '0.74rem' }} onClick={onReply} title="Reply">↩</button>
            {msg.can_edit && <button className="btn btn-ghost" style={{ padding: '0 6px', fontSize: '0.74rem' }} onClick={onStartEdit} title="Edit (15 min window)">✎</button>}
            <button className="btn btn-ghost" style={{ padding: '0 6px', fontSize: '0.74rem', color: 'var(--error)' }} onClick={onDelete} title="Delete">🗑</button>
          </span>
        )}
      </div>
      {editing ? (
        <div style={{ marginTop: 4 }}>
          <textarea className="input" rows={2} value={editBody} onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave(); } if (e.key === 'Escape') onEditCancel(); }} autoFocus />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button className="btn btn-gold" style={{ padding: '3px 12px', fontSize: '0.78rem' }} onClick={onEditSave}>Save</button>
            <button className="btn btn-ghost" style={{ padding: '3px 12px', fontSize: '0.78rem' }} onClick={onEditCancel}>Cancel</button>
            <span style={{ alignSelf: 'center', color: 'var(--text-dim)', fontSize: '0.72rem' }}>Enter to save · Esc to cancel</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.body}</div>
      )}
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────

const modalBg = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };

function ChannelModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { setError('Channel name required.'); return; }
    setSaving(true);
    const resp = await chatCreateChannel({ name, description, visibility });
    setSaving(false);
    if (resp?.error) { setError(resp.error); return; }
    onCreated(resp.conversation);
  }
  return (
    <div style={modalBg}>
      <div className="card" style={{ width: '100%', maxWidth: 480 }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>New channel</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Name</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. client-onboarding" />
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Description</div>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this channel for?" />
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['public', 'private'].map((v) => (
            <button key={v} onClick={() => setVisibility(v)}
              style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${visibility === v ? 'var(--olive)' : 'var(--border)'}`,
                background: visibility === v ? 'rgba(92,110,45,0.08)' : 'transparent',
                color: visibility === v ? 'var(--olive)' : 'var(--text-muted)', fontSize: '0.84rem', fontWeight: 600 }}>
              {v === 'public' ? '🌐 Public' : '🔒 Private'}
              <div style={{ fontWeight: 400, fontSize: '0.74rem', marginTop: 2 }}>{v === 'public' ? 'Anyone can join' : 'Invite only'}</div>
            </button>
          ))}
        </div>
        {error && <div style={{ color: 'var(--error)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create channel'}</button>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ onClose, onCreated }) {
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { chatMembers().then((d) => d?.members && setMembers(d.members)); }, []);
  function toggle(id) { setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }
  async function submit() {
    if (selected.length < 1) { setError('Pick at least one person.'); return; }
    const resp = await chatCreateGroup({ name, member_ids: selected });
    if (resp?.error) { setError(resp.error); return; }
    onCreated(resp.conversation);
  }
  return (
    <div style={modalBg}>
      <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>New group chat</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Group name (optional)</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 review crew" />
        </label>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>Add people</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {members.map((m) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: selected.includes(m.id) ? 'var(--bg-elev-2)' : 'transparent' }}>
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
              <span style={{ flex: 1 }}>{m.name}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>{m.title || m.role}</span>
            </label>
          ))}
        </div>
        {error && <div style={{ color: 'var(--error)', fontSize: '0.82rem', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={submit}>Create group</button>
        </div>
      </div>
    </div>
  );
}

function DMModal({ onClose, onCreated }) {
  const [members, setMembers] = useState([]);
  useEffect(() => { chatMembers().then((d) => d?.members && setMembers(d.members)); }, []);
  async function open(id) {
    const resp = await chatOpenDM(id);
    if (resp?.conversation) onCreated(resp.conversation);
  }
  return (
    <div style={modalBg}>
      <div className="card" style={{ width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>New direct message</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map((m) => (
            <button key={m.id} onClick={() => open(m.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <div className="avatar" style={{ width: 30, height: 30, fontSize: '0.74rem', background: m.avatar_color || '#777', color: '#fff' }}>
                {m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.name}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>{m.title || m.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoverModal({ onClose, onJoined }) {
  const [channels, setChannels] = useState([]);
  useEffect(() => { chatDiscover().then((d) => d?.channels && setChannels(d.channels)); }, []);
  async function join(id) {
    const resp = await chatJoinChannel(id);
    if (resp?.conversation) onJoined(resp.conversation);
  }
  return (
    <div style={modalBg}>
      <div className="card" style={{ width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Browse public channels</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        {channels.length === 0 && <div className="empty">You've already joined every public channel.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {channels.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}># {c.name}</div>
                {c.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{c.description}</div>}
                <div style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>{c.member_count} members</div>
              </div>
              <button className="btn btn-gold" style={{ padding: '4px 14px', fontSize: '0.8rem' }} onClick={() => join(c.id)}>Join</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
