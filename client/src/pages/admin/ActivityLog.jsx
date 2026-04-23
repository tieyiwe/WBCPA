import React, { useEffect, useState } from 'react';
import { getActivity, getTeam } from '../../lib/api.js';
import { useRole } from '../../lib/roleContext.jsx';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import { timeAgo, initials } from '../../lib/utils.js';

const ACTION_ICONS = {
  'team.invited': '✉',
  'team.updated': '✎',
  'team.deactivated': '⊘',
  'role.permission_changed': '⚑',
  'task.assigned': '→',
  'task.completed': '✓',
  'task.created': '+',
  'task.updated': '✎',
  'task.deleted': '×',
  'note.created': '✎',
  'note.deleted': '×',
  'note.pinned': '⌾',
  'email.resolved': '✉',
  'subscriber.updated': '✎',
  'agent.deployed': '✦',
  'appointment.booked': '▣',
  'system.setting_changed': '⚙',
  'api_key.rotated': '↻'
};

const ACTION_COLORS = {
  'team.invited': 'var(--info)',
  'team.updated': 'var(--text-muted)',
  'team.deactivated': 'var(--error)',
  'role.permission_changed': 'var(--gold)',
  'task.assigned': 'var(--info)',
  'task.completed': 'var(--success)',
  'task.created': 'var(--success)',
  'task.updated': 'var(--text-muted)',
  'task.deleted': 'var(--error)',
  'note.created': 'var(--gold)',
  'note.deleted': 'var(--error)',
  'note.pinned': 'var(--gold)',
  'email.resolved': 'var(--success)',
  'subscriber.updated': 'var(--text-muted)',
  'agent.deployed': 'var(--gold)',
  'appointment.booked': 'var(--success)',
  'system.setting_changed': 'var(--warning)',
  'api_key.rotated': 'var(--warning)'
};

export default function ActivityLog() {
  const { can } = useRole();
  const [activity, setActivity] = useState([]);
  const [team, setTeam] = useState([]);
  const [filter, setFilter] = useState({ action: '', actor_id: '' });
  const [loading, setLoading] = useState(true);

  if (!can('activity.view')) return <AccessDenied permission="activity.view" />;

  async function refresh() {
    setLoading(true);
    const params = { limit: 200 };
    if (filter.action) params.action = filter.action;
    if (filter.actor_id) params.actor_id = filter.actor_id;
    const data = await getActivity(params);
    if (data?.activity) setActivity(data.activity);
    setLoading(false);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filter.action, filter.actor_id]);
  useEffect(() => {
    (async () => {
      const data = await getTeam();
      if (data?.members) setTeam(data.members);
    })();
  }, []);

  const uniqueActions = Array.from(new Set(activity.map((a) => a.action))).sort();

  return (
    <div className="card">
      <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>Activity Log</div>
          <div className="card-sub" style={{ marginTop: 2 }}>
            {loading ? 'Loading…' : `${activity.length} events`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" value={filter.actor_id} onChange={(e) => setFilter({ ...filter, actor_id: e.target.value })} style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
            <option value="">All people</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select className="input" value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })} style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
            <option value="">All actions</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {(filter.action || filter.actor_id) && (
            <button className="btn btn-ghost" onClick={() => setFilter({ action: '', actor_id: '' })}>Clear</button>
          )}
        </div>
      </div>

      {activity.length === 0 && !loading && <div className="empty">No activity yet.</div>}

      <div>
        {activity.map((a) => {
          const color = ACTION_COLORS[a.action] || 'var(--text-muted)';
          const icon = ACTION_ICONS[a.action] || '•';
          return (
            <div key={a.id} style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
              alignItems: 'flex-start'
            }}>
              <div style={{
                width: 32, height: 32, flex: 'none',
                borderRadius: 8,
                background: `${color}20`, border: `1px solid ${color}55`,
                color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700
              }}>{icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{a.actor_name}</span>
                  <span className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{a.action}</span>
                  {a.target_label && (
                    <>
                      <span style={{ color: 'var(--text-dim)' }}>·</span>
                      <span style={{ color: 'var(--gold-soft)' }}>{a.target_label}</span>
                    </>
                  )}
                </div>
                {a.summary && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>{a.summary}</div>
                )}
                <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: 4 }}>{timeAgo(a.at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
