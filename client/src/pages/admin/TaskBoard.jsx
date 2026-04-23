import React, { useEffect, useState } from 'react';
import { getTaskBoard, getTeam, createTask, updateTask, deleteTask } from '../../lib/api.js';
import { useRole } from '../../lib/roleContext.jsx';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import { timeAgo, initials } from '../../lib/utils.js';

const COLUMNS = [
  { key: 'todo',        title: 'To do',       color: '#7a8399' },
  { key: 'in_progress', title: 'In progress', color: '#60a5fa' },
  { key: 'review',      title: 'Review',      color: '#c9a84c' },
  { key: 'done',        title: 'Done',        color: '#2dd4aa' }
];

const PRIORITY_COLORS = {
  high:   { bg: 'rgba(248,113,113,0.12)', color: '#f87171', label: 'High' },
  medium: { bg: 'rgba(249,115,22,0.12)',  color: '#f97316', label: 'Medium' },
  low:    { bg: 'rgba(122,131,153,0.12)', color: '#7a8399', label: 'Low' }
};

export default function TaskBoard() {
  const { can } = useRole();
  const [board, setBoard] = useState({ todo: [], in_progress: [], review: [], done: [] });
  const [team, setTeam] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!can('tasks.view')) return <AccessDenied permission="tasks.view" />;

  async function refresh() {
    setLoading(true);
    const [b, t] = await Promise.all([getTaskBoard(), getTeam()]);
    if (b?.board) setBoard(b.board);
    if (t?.members) setTeam(t.members);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(form) {
    await createTask(form);
    setShowCreate(false);
    refresh();
  }

  async function handleMove(task, newStatus) {
    await updateTask(task.id, { status: newStatus });
    refresh();
  }

  async function handleAssign(task, assignee_id) {
    await updateTask(task.id, { assignee_id });
    refresh();
  }

  async function handleDelete(task) {
    if (!confirm(`Delete "${task.title}"?`)) return;
    await deleteTask(task.id);
    refresh();
  }

  const totalCount = Object.values(board).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex-between">
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Task Board</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              {loading ? 'Loading…' : `${totalCount} total · ${board.done.length} completed`}
            </div>
          </div>
          {can('tasks.create') && (
            <button className="btn btn-gold" onClick={() => setShowCreate(true)}>+ New task</button>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 12
      }}>
        {COLUMNS.map((col) => (
          <div key={col.key} className="card" style={{ padding: 12, background: 'var(--bg-elev)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col.color }} />
                <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.78rem' }}>{col.title}</span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {board[col.key]?.length || 0}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
              {(board[col.key] || []).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  team={team}
                  can={can}
                  onMove={handleMove}
                  onAssign={handleAssign}
                  onDelete={handleDelete}
                />
              ))}
              {(board[col.key] || []).length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.82rem', padding: '14px 0' }}>
                  Nothing here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateTaskModal team={team} onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function TaskCard({ task, team, can, onMove, onAssign, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const prio = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const nextIdx = COLUMNS.findIndex((c) => c.key === task.status);
  const prevStatus = nextIdx > 0 ? COLUMNS[nextIdx - 1].key : null;
  const nextStatus = nextIdx < COLUMNS.length - 1 ? COLUMNS[nextIdx + 1].key : null;

  const overdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done';

  return (
    <div
      className="card"
      style={{
        padding: 10,
        borderColor: overdue ? 'rgba(248,113,113,0.35)' : 'var(--border)',
        cursor: 'pointer'
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 999,
          background: prio.bg, color: prio.color
        }}>
          {prio.label}
        </span>
        {overdue && <span className="badge badge-red">Overdue</span>}
        {task.related_label && (
          <span className="badge badge-muted" style={{ fontSize: '0.66rem' }}>
            {task.related_label}
          </span>
        )}
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6, lineHeight: 1.35 }}>{task.title}</div>

      {expanded && task.description && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: 8, lineHeight: 1.5 }}>
          {task.description}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.assignee_id ? (
            <>
              <div className="avatar" style={{
                width: 22, height: 22, fontSize: '0.68rem',
                background: team.find((t) => t.id === task.assignee_id)?.avatar_color || '#555',
                color: '#0a0d14'
              }}>
                {initials(task.assignee_name)}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{task.assignee_name}</span>
            </>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Unassigned</span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: overdue ? 'var(--error)' : 'var(--text-dim)' }}>
          {task.due_at ? timeAgo(task.due_at) : ''}
        </div>
      </div>

      {expanded && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {can('tasks.assign') && (
            <select
              className="input"
              value={task.assignee_id || ''}
              onChange={(e) => onAssign(task, e.target.value || null)}
              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
            >
              <option value="">Unassigned</option>
              {team.filter((m) => m.status === 'active').map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {prevStatus && can('tasks.complete') && (
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => onMove(task, prevStatus)}>
              ← {COLUMNS.find((c) => c.key === prevStatus).title}
            </button>
          )}
          {nextStatus && can('tasks.complete') && (
            <button className="btn btn-gold" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => onMove(task, nextStatus)}>
              {COLUMNS.find((c) => c.key === nextStatus).title} →
            </button>
          )}
          {can('tasks.delete') && (
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px', color: 'var(--error)' }} onClick={() => onDelete(task)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateTaskModal({ team, onSubmit, onClose }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', assignee_id: '', due_at: '', status: 'todo'
  });

  function submit(e) {
    e.preventDefault();
    onSubmit({
      ...form,
      assignee_id: form.assignee_id || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card"
        style={{ width: 520, maxWidth: '92vw' }}
      >
        <div className="card-title">Create task</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Assign work to any active team member.</div>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Title</div>
          <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Description</div>
          <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Assignee</div>
            <select className="input" value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
              <option value="">Unassigned</option>
              {team.filter((m) => m.status === 'active').map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Priority</div>
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Due date</div>
            <input type="datetime-local" className="input" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
          </label>
          <label>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="review">Review</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-gold">Create task</button>
        </div>
      </form>
    </div>
  );
}
