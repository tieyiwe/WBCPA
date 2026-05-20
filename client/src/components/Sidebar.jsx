import React, { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
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
      { to: '/dashboard/calls', icon: '☏', title: 'Call Log', permission: 'calls.view' }
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
    label: 'Team',
    items: [
      { to: '/dashboard/chat', icon: '✉', title: 'Team Chat', permission: 'chat.use' }
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
      { to: '/dashboard/admin/activity',      icon: '◔', title: 'Activity Log',  permission: 'activity.view' }
    ]
  },
  {
    // Technical / infrastructure — Super Owner (TIblogics) only.
    // The whole group hides for everyone else since every item is super_owner-gated.
    label: 'TIblogics',
    items: [
      { to: '/dashboard/agent',          icon: '✦', title: 'Celine — Voice Agent', permission: 'agent.view' },
      { to: '/dashboard/admin/settings', icon: '⚙', title: 'System Settings',      permission: 'system.settings.view' },
      { to: '/dashboard/setup',          icon: '⚙', title: 'Setup Guide',          permission: 'setup.view' }
    ]
  }
];

const PIN_KEY = 'wbcpa_sidebar_pinned';

export default function Sidebar() {
  const { role, can } = useRole();
  const [season, setSeason] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [openEscalations, setOpenEscalations] = useState(0);
  const [pendingDocs, setPendingDocs] = useState(0);
  const [profile, setProfile] = useState(null);
  const location = useLocation();
  // Groups are collapsed by default. Hover peeks them open; clicking the header
  // "pins" a group so it stays open after the mouse leaves. Pins persist.
  const [pinned, setPinned] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PIN_KEY) || '[]')); }
    catch { return new Set(); }
  });
  const [hovered, setHovered] = useState(null);

  function togglePin(label) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      try { localStorage.setItem(PIN_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }

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
          const isPinned = pinned.has(group.label);
          // The group that contains the current route stays open so you never
          // lose your place. Otherwise: open only when pinned or hovered.
          const hasActive = visibleItems.some((i) => i.end ? location.pathname === i.to : location.pathname.startsWith(i.to));
          const isOpen = isPinned || hovered === group.label || hasActive;
          // Sum badge counts so a collapsed group still signals attention
          const groupBadgeTotal = visibleItems.reduce((sum, i) => sum + (i.badgeKey ? (badges[i.badgeKey] || 0) : 0), 0);
          return (
            <div
              className="nav-group"
              key={group.label}
              onMouseEnter={() => setHovered(group.label)}
              onMouseLeave={() => setHovered((h) => (h === group.label ? null : h))}
            >
              <button
                type="button"
                className={`nav-group-label nav-group-toggle ${isPinned ? 'pinned' : ''}`}
                onClick={() => togglePin(group.label)}
                aria-expanded={isOpen}
                title={isPinned ? 'Click to unpin (collapses when you move away)' : 'Click to keep this menu open'}
              >
                <span style={{ display: 'inline-block', width: 12, fontSize: '0.7rem', transition: 'transform 0.15s ease', transform: isOpen ? 'none' : 'rotate(-90deg)' }}>▾</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{group.label}</span>
                {isPinned && <span style={{ fontSize: '0.66rem', opacity: 0.8 }} title="Pinned open">📌</span>}
                {!isOpen && groupBadgeTotal > 0 && (
                  <span className="badge" style={{ background: 'rgba(184,58,38,0.15)', color: 'var(--error)', borderColor: 'rgba(184,58,38,0.45)' }}>{groupBadgeTotal}</span>
                )}
              </button>
              {isOpen && visibleItems.map((item) => (
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
            borderRadius: 8, textDecoration: 'none', color: '#fff',
            border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)'
          }}>
            <div className="avatar" style={{
              width: 32, height: 32, fontSize: '0.78rem',
              background: profile.avatar_color || '#555', color: '#fff', flex: 'none'
            }}>{initials(profile.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
                {profile.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
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
