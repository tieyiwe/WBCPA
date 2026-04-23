import React from 'react';
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useRole } from '../../lib/roleContext.jsx';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';

const TABS = [
  { to: 'team',          title: 'Team',          icon: '◉', permission: 'team.view' },
  { to: 'roles',         title: 'Roles',         icon: '⚑', permission: 'roles.view' },
  { to: 'tasks',         title: 'Tasks',         icon: '▤', permission: 'tasks.view' },
  { to: 'collaboration', title: 'Collaboration', icon: '✎', permission: 'notes.view' },
  { to: 'activity',      title: 'Activity Log',  icon: '◔', permission: 'activity.view' },
  { to: 'settings',      title: 'Settings',      icon: '⚙', permission: 'system.settings.view' }
];

export default function AdminPanel() {
  const { can, role, roleDetail } = useRole();
  const location = useLocation();

  if (!can('admin.view')) return <AccessDenied permission="admin.view" />;

  const atRoot = location.pathname === '/dashboard/admin' || location.pathname === '/dashboard/admin/';
  if (atRoot) {
    const firstAllowed = TABS.find((t) => can(t.permission));
    if (firstAllowed) return <Navigate to={firstAllowed.to} replace />;
    return <AccessDenied permission="admin.view" />;
  }

  return (
    <div className="page">
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TABS.filter((t) => can(t.permission)).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `btn ${isActive ? 'btn-gold' : 'btn-ghost'}`
              }
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              <span style={{ marginRight: 6 }}>{t.icon}</span>
              {t.title}
            </NavLink>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <span>Viewing as</span>
          <RoleBadge role={role} />
        </div>
      </div>

      <Outlet />
    </div>
  );
}
