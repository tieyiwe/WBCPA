import React, { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { getEmailQueue, getEscalationSummary, getMe, getTaxDocSummary } from '../lib/api.js';
import { SEASON_LABELS } from './SeasonPill.jsx';
import { useRole } from '../lib/roleContext.jsx';
import RoleBadge from './RoleBadge.jsx';
import { initials } from '../lib/utils.js';

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
      { to: '/dashboard/agent', icon: '✦', title: 'Celine — Voice Agent', permission: 'agent.view' }
    ]
  },
  {
    label: 'My Work',
    items: [
      { to: '/dashboard/escalations', icon: '⚠', title: 'Escalations', badgeKey: 'openEscalations', permission: 'emails.view' },
      { to: '/dashboard/taxdocs', icon: '◧', title: 'Tax Documents', badgeKey: 'pendingDocs', permission: 'taxdocs.view' },
      { to: '/dashboard/admin/tasks', icon: '▤', title: 'Tasks', permission: 'tasks.view' },
      { to: '/dashboard/profile', icon: '◐', title: 'My Profile', permission: 'dashboard.view' }
    ]
  },
  {
    label: 'AI Assistant',
    items: [
      { to: '/dashboard/milton', icon: '◈', title: 'Ask Milton', permission: 'milton.use' }
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
      { to: '/dashboard/admin/collaboration', icon: '✎', title: 'Collaboration', permission: 'notes.view' },
      { to: '/dashboard/admin/activity',      icon: '◔', title: 'Activity Log',  permission: 'activity.view' },
      { to: '/dashboard/admin/settings',      icon: '⚙', title: 'Settings',      permission: 'system.settings.view' }
    ]
  },
  {
    label: 'Setup',
    items: [
      { to: '/dashboard/setup', icon: '⚙', title: 'Setup Guide', permission: 'setup.view' }
    ]
  }
];

export default function Sidebar() {
  const { role, can } = useRole();
  const [season, setSeason] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [openEscalations, setOpenEscalations] = useState(0);
  const [pendingDocs, setPendingDocs] = useState(0);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      const [queue, escSummary, me, docSum] = await Promise.all([
        getEmailQueue(),
        getEscalationSummary(),
        getMe(),
        getTaxDocSummary()
      ]);
      if (!mounted) return;
      if (queue?.queue) setReviewCount(queue.queue.length);
      if (escSummary?.summary) setOpenEscalations(escSummary.summary.open);
      if (me?.profile) setProfile(me.profile);
      if (docSum?.summary) setPendingDocs(docSum.summary.pending_action || 0);
    }
    loadAll();

    (async () => {
      try {
        const resp = await fetch('/api/voice/prompt');
        const data = await resp.json();
        if (mounted && data?.season) setSeason(data.season);
      } catch { /* ignore */ }
    })();

    const interval = setInterval(loadAll, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [role]);

  const badges = { reviewCount, openEscalations, pendingDocs };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="title">WBCPA Command Center</div>
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
                    <span className={`badge ${item.badgeKey === 'openEscalations' ? 'badge-urgent-pulse' : ''}`}
                          style={item.badgeKey === 'openEscalations'
                            ? { background: 'rgba(184,58,38,0.15)', color: 'var(--error)', borderColor: 'rgba(184,58,38,0.45)' }
                            : undefined}>
                      {badges[item.badgeKey]}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {profile && (
          <Link to="/dashboard/profile" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 8,
            borderRadius: 8, textDecoration: 'none', color: 'inherit',
            border: '1px solid var(--border)', background: 'var(--bg-elev-2)'
          }}>
            <div className="avatar" style={{
              width: 32, height: 32, fontSize: '0.78rem',
              background: profile.avatar_color || '#555', color: '#fff', flex: 'none'
            }}>{initials(profile.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {profile.title || profile.email}
              </div>
            </div>
            <RoleBadge role={role} />
          </Link>
        )}
        <div>
          <span className="status-dot" />
          Command Center — {season ? (SEASON_LABELS[season] || 'Online') : 'Online'}
        </div>
      </div>
    </aside>
  );
}
