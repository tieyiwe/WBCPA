import React, { useEffect, useState, useMemo } from 'react';
import { getNotes, createNote, pinNote, deleteNote, getTeam } from '../../lib/api.js';
import { useRole } from '../../lib/roleContext.jsx';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import { timeAgo, initials } from '../../lib/utils.js';

const TARGET_FILTERS = [
  { key: 'all', label: 'All notes' },
  { key: 'general', label: 'Team broadcasts' },
  { key: 'subscriber', label: 'On subscribers' },
  { key: 'call', label: 'On calls' },
  { key: 'appointment', label: 'On appointments' }
];

export default function CollaborationHub() {
  const { can, role } = useRole();
  const [notes, setNotes] = useState([]);
  const [team, setTeam] = useState([]);
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [targetType, setTargetType] = useState('general');
  const [loading, setLoading] = useState(true);

  if (!can('notes.view')) return <AccessDenied permission="notes.view" />;

  async function refresh() {
    setLoading(true);
    const [n, t] = await Promise.all([getNotes(), getTeam()]);
    if (n?.notes) setNotes(n.notes);
    if (t?.members) setTeam(t.members);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handlePost() {
    if (!draft.trim()) return;
    const mentions = extractMentions(draft, team);
    await createNote({
      body: draft.trim(),
      target_type: targetType,
      target_id: null,
      target_label: targetType === 'general' ? 'Team announcement' : null,
      mentions
    });
    setDraft('');
    refresh();
  }

  async function handlePin(note) {
    await pinNote(note.id);
    refresh();
  }

  async function handleDelete(note) {
    if (!confirm('Delete this note?')) return;
    await deleteNote(note.id);
    refresh();
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return notes;
    return notes.filter((n) => n.target_type === filter);
  }, [notes, filter]);

  const pinned = filtered.filter((n) => n.pinned);
  const rest = filtered.filter((n) => !n.pinned);

  return (
    <div>
      {can('notes.create') && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">Post to the team</div>
          <div className="card-sub" style={{ marginBottom: 10 }}>
            Use <code style={{ background: 'var(--bg-elev-2)', padding: '1px 6px', borderRadius: 4 }}>@name</code> to mention a teammate. Notes are visible to anyone with the right role.
          </div>
          <textarea
            className="input"
            rows={3}
            placeholder="Share context, ask a question, or flag something for @someone…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: '100%', fontFamily: 'var(--font-body)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ padding: '6px 10px' }}>
              <option value="general">Team broadcast</option>
              <option value="subscriber">Pinned to a subscriber</option>
              <option value="call">Pinned to a call</option>
              <option value="appointment">Pinned to an appointment</option>
            </select>
            <div style={{ flex: 1, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              Posting as <strong style={{ color: 'var(--gold-soft)' }}>{role}</strong>
            </div>
            <button className="btn btn-gold" onClick={handlePost} disabled={!draft.trim()}>
              Post note
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Internal Notes</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              {loading ? 'Loading…' : `${filtered.length} notes · ${pinned.length} pinned`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TARGET_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`btn ${filter === f.key ? 'btn-gold' : 'btn-ghost'}`}
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 && !loading && <div className="empty">No notes yet.</div>}

        {pinned.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)', marginBottom: 8 }}>
              ⌾ Pinned
            </div>
            {pinned.map((n) => (
              <NoteCard key={n.id} note={n} team={team} can={can} onPin={handlePin} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {rest.map((n) => (
          <NoteCard key={n.id} note={n} team={team} can={can} onPin={handlePin} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note, team, can, onPin, onDelete }) {
  const rendered = useMemo(() => renderBody(note.body, team), [note.body, team]);
  const author = team.find((t) => t.id === note.author_id);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      background: note.pinned ? 'rgba(201,168,76,0.04)' : 'transparent',
      borderColor: note.pinned ? 'rgba(201,168,76,0.35)' : 'var(--border)'
    }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="avatar" style={{
          width: 36, height: 36,
          background: author?.avatar_color || '#555',
          color: '#0a0d14',
          flex: 'none'
        }}>
          {initials(note.author_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{note.author_name}</span>
            {note.target_label && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                  {note.target_label}
                </span>
              </>
            )}
            <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{timeAgo(note.created_at)}</span>
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.55, color: 'var(--text)' }}>
            {rendered}
          </div>
          {note.mentions?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Notifying: {note.mentions.map((id) => team.find((t) => t.id === id)?.name).filter(Boolean).join(', ')}
            </div>
          )}
          {can('notes.create') && (
            <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: '0.76rem' }} onClick={() => onPin(note)}>
                {note.pinned ? 'Unpin' : 'Pin'}
              </button>
              {can('notes.delete.any') && (
                <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: '0.76rem', color: 'var(--error)' }} onClick={() => onDelete(note)}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractMentions(body, team) {
  const ids = [];
  for (const m of team) {
    const firstLast = m.name.split(/\s+/);
    const patterns = [
      m.name,
      firstLast[0],
      firstLast.length > 1 ? `${firstLast[0]} ${firstLast[firstLast.length - 1]}` : null
    ].filter(Boolean);
    for (const p of patterns) {
      const re = new RegExp(`@${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(body)) {
        ids.push(m.id);
        break;
      }
    }
  }
  return Array.from(new Set(ids));
}

function renderBody(body, team) {
  const nodes = [];
  let remaining = body;
  let key = 0;
  const mentionRe = /@([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/;

  while (remaining.length > 0) {
    const match = mentionRe.exec(remaining);
    if (!match) { nodes.push(<span key={key++}>{remaining}</span>); break; }
    if (match.index > 0) nodes.push(<span key={key++}>{remaining.slice(0, match.index)}</span>);
    const name = match[1];
    const member = team.find((m) => m.name.toLowerCase().startsWith(name.toLowerCase()));
    nodes.push(
      <span key={key++} style={{
        color: member?.avatar_color || 'var(--gold)',
        background: `${member?.avatar_color || '#c9a84c'}15`,
        padding: '1px 6px',
        borderRadius: 4,
        fontWeight: 600
      }}>@{name}</span>
    );
    remaining = remaining.slice(match.index + match[0].length);
  }
  return nodes;
}
