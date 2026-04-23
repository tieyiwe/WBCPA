import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getEmailQueue } from '../lib/api.js';
import { SEASON_LABELS } from './SeasonPill.jsx';
import { useRole } from '../lib/roleContext.jsx';
import RoleBadge from './RoleBadge.jsx';

const NAV = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', end: true, icon: '◆', title: 'Dashboard', permission: 'dashboard.view' }
    ]
  },
  {
    label: 'Voice Agent',
    items: [
      { to: '/dashboard/calls', icon: '☏', title: 'Call Log', permission: 'calls.view' },
      { to: '/dashboard/agent', icon: '✦', title: 'Agent Config', permission: 'agent.view' }
    ]
  },
  {
    label: 'Subscribers',
    items: [
      { to: '/dashboard/subscribers', icon: '◈', title: 'Members', permission: 'subscribers.view' },
      { to: '/dashboard/appointments', icon: '▣', title: 'Appointments', permission: 'appointments.view' }
    ]
  },
  {
    label: 'Communications',
    items: [
      { to: '/dashboard/emails', icon: '✉', title: 'Email Queue', badgeKey: 'reviewCount', permission: 'emails.view' }
    ]
  },
  {
    label: 'Admin',
    items: [
      { to: '/dashboard/admin/team',          icon: '◉', title: 'Team',          permission: 'team.view' },
      { to: '/dashboard/admin/roles',         icon: '⚑', title: 'Roles',         permission: 'roles.view' },
      { to: '/dashboard/admin/tasks',         icon: '▤', title: 'Tasks',         permission: 'tasks.view' },
      { to: '/dashboard/admin/collaboration', icon: '✎', title: 'Collaboration', permission: 'notes.view' },
      { to: '/dashboard/admin/activity',      icon: '◔', title: 'Activity Log',  permission: 'activity.view' },
      { to: '/dashboard/admin/settings',      icon: '⚙', title: 'Settings',      permission: 'system.settings.view' }
    ]
  },
  {
    label: 'Setup',
    items: [
      { to: '/dashboard/setup', icon: '⚙', title: 'Setup Guide', permission: 'dashboard.view' }
    ]
  }
];

export default function Sidebar() {
  const { role, can } = useRole();
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
        {NAV.map((group) => {
          const visibleItems = group.items.filter((i) => !i.permission || can(i.permission));
          if (visibleItems.length === 0) return null;
          return (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {visibleItems.map((item) => (
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
          );
        })}
      </nav>

      <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Role</span>
          <RoleBadge role={role} />
        </div>
        <div>
          <span className="status-dot" />
          Super Agent — {season ? (SEASON_LABELS[season] || 'Online') : 'Online'}
        </div>
      </div>
    </aside>
  );
}
