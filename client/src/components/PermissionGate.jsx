import React from 'react';
import { useRole } from '../lib/roleContext.jsx';

export default function PermissionGate({ permission, children, fallback = null }) {
  const { can } = useRole();
  if (!can(permission)) return fallback;
  return <>{children}</>;
}

export function AccessDenied({ permission }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🔒</div>
      <div className="card-title" style={{ marginBottom: 4 }}>Access Restricted</div>
      <div className="card-sub">
        Your current role does not have permission to view this page.
      </div>
      {permission && (
        <div style={{ marginTop: 18, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Required permission: <code>{permission}</code>
        </div>
      )}
    </div>
  );
}
