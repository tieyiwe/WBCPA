import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getEmailQueue } from '../lib/api.js';
import { SEASON_LABELS } from './SeasonPill.jsx';

const NAV = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', end: true, icon: '◆', title: 'Dashboard' }
    ]
  },
  {
    label: 'Voice Agent',
    items: [
      { to: '/dashboard/calls', icon: '☏', title: 'Call Log' },
      { to: '/dashboard/agent', icon: '✦', title: 'Agent Config' }
    ]
  },
  {
    label: 'Subscribers',
    items: [
      { to: '/dashboard/subscribers', icon: '◈', title: 'Members' },
      { to: '/dashboard/appointments', icon: '▣', title: 'Appointments' }
    ]
  },
  {
    label: 'Communications',
    items: [
      { to: '/dashboard/emails', icon: '✉', title: 'Email Queue', badgeKey: 'reviewCount' }
    ]
  },
  {
    label: 'Setup',
    items: [
      { to: '/dashboard/setup', icon: '⚙', title: 'Setup Guide' }
    ]
  }
];

export default function Sidebar() {
  const [season, setSeason] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const queue = await getEmailQueue();
      if (mounted && queue?.queue) setReviewCount(queue.queue.length);
    })();

    (async () => {
      try {
        const resp = await fetch('/api/voice/prompt');
        const data = await resp.json();
        if (mounted && data?.season) setSeason(data.season);
      } catch { /* ignore */ }
    })();

    return () => { mounted = false; };
  }, []);

  const badges = { reviewCount };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="title">WBCPA Super Agent</div>
        <div className="sub">Powered by TIblogics</div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {NAV.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span style={{ width: 18, textAlign: 'center', color: 'var(--gold)' }}>{item.icon}</span>
                <span>{item.title}</span>
                {item.badgeKey && badges[item.badgeKey] > 0 && (
                  <span className="badge">{badges[item.badgeKey]}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div>
          <span className="status-dot" />
          Super Agent — {season ? (SEASON_LABELS[season] || 'Online') : 'Online'}
        </div>
      </div>
    </aside>
  );
}
