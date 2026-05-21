import React, { useEffect, useState } from 'react';
import StatCard from '../components/StatCard.jsx';
import CallItem from '../components/CallItem.jsx';
import { getDashboard } from '../lib/api.js';
import { formatDuration, tierColor, statusColor, timeAgo } from '../lib/utils.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const resp = await getDashboard();
      if (resp?.error) setError(resp.error);
      else setData(resp);
    })();
  }, []);

  if (error) return <div className="page"><div className="empty">Could not load dashboard: {error}</div></div>;
  if (!data) return <div className="page"><div className="empty">Loading…</div></div>;

  const { agentStats, subscriberStats, todayCalendar, recentCalls, openReviews, callTrend, topSubscribers } = data;

  const maxBar = Math.max(1, ...callTrend.map((b) => b.count));

  return (
    <div className="page">
      <div className="stats-grid">
        <StatCard
          icon="☏"
          tone="gold"
          label="Calls Today"
          value={agentStats?.today?.calls ?? 0}
          sub={`Avg ${formatDuration(agentStats?.today?.avgDuration || 0)}`}
        />
        <StatCard
          icon="◈"
          tone="green"
          label="Active Subscribers"
          value={subscriberStats?.active ?? 0}
          sub={`${subscriberStats?.total ?? 0} total members`}
        />
        <StatCard
          icon="▣"
          tone="blue"
          label="Bookings Today"
          value={todayCalendar?.todayCount ?? 0}
          sub={`${agentStats?.today?.bookings ?? 0} booked on calls`}
        />
        <StatCard
          icon="!"
          tone="red"
          label="Review Queue"
          value={openReviews?.length ?? 0}
          sub="Items needing attention"
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Recent Calls</div>
          {recentCalls?.length ? (
            recentCalls.map((c) => <CallItem key={c.id || c.bland_call_id} call={c} />)
          ) : (
            <div className="empty">No recent calls yet.</div>
          )}
        </div>

        <div className="card">
          <div className="card-title">7-Day Call Volume</div>
          <div className="card-sub">Inbound calls handled by the voice agent</div>
          <div className="bar-chart">
            {callTrend.map((b, i) => {
              const height = (b.count / maxBar) * 100;
              return (
                <div className="bar-col" key={i}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', position: 'relative' }}>
                    <div className="bar" style={{ height: `${height}%` }}>
                      {b.count > 0 && <span className="val">{b.count}</span>}
                    </div>
                  </div>
                  <span className="label">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card mt-lg">
        <div className="card-title">Subscriber Overview</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Calls</th>
                <th>Last Call</th>
              </tr>
            </thead>
            <tbody>
              {topSubscribers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{s.email}</div>
                  </td>
                  <td><span className={`badge badge-${tierColor(s.tier)}`}>{s.tier}</span></td>
                  <td><span className={`badge badge-${statusColor(s.status)}`}>{s.status}</span></td>
                  <td className="mono">{s.call_count ?? 0}</td>
                  <td>{timeAgo(s.last_call)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
