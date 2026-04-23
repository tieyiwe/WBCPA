import React, { useEffect, useState } from 'react';
import { getRoles } from '../../lib/api.js';
import { useRole } from '../../lib/roleContext.jsx';
import { ROLES } from '../../lib/permissions.js';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';

const GROUPS = [
  { label: 'View access',           prefixes: ['dashboard.', 'subscribers.view', 'calls.', 'emails.view', 'appointments.view', 'notes.view', 'tasks.view'] },
  { label: 'Client operations',     prefixes: ['subscribers.edit', 'subscribers.delete', 'emails.respond', 'appointments.book', 'appointments.cancel'] },
  { label: 'Voice agent',           prefixes: ['agent.'] },
  { label: 'Collaboration',         prefixes: ['notes.create', 'notes.delete', 'tasks.create', 'tasks.assign', 'tasks.complete', 'tasks.delete'] },
  { label: 'Team management',       prefixes: ['admin.view', 'team.', 'roles.'] },
  { label: 'System & billing',      prefixes: ['activity.', 'system.', 'integrations.', 'api_keys.', 'billing.'] }
];

function matches(key, prefixes) {
  return prefixes.some((p) => key === p || key.startsWith(p));
}

export default function RolesMatrix() {
  const { can } = useRole();
  const [matrix, setMatrix] = useState([]);
  const [roleList, setRoleList] = useState([]);
  const [loading, setLoading] = useState(true);

  if (!can('roles.view')) return <AccessDenied permission="roles.view" />;

  useEffect(() => {
    (async () => {
      const data = await getRoles();
      if (data?.matrix) setMatrix(data.matrix);
      if (data?.roles) setRoleList(data.roles);
      setLoading(false);
    })();
  }, []);

  const allRoles = Object.values(ROLES).sort((a, b) => b.rank - a.rank);

  return (
    <div>
      <div className="card">
        <div className="card-title">Roles</div>
        <div className="card-sub">Five roles, ranked by access level. Hover each card for a short description.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          {allRoles.map((r) => {
            const count = roleList.find((x) => x.key === r.key)?.permissions?.length ?? 0;
            return (
              <div key={r.key} className="card" style={{ padding: 14, borderColor: `${r.color}44` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <RoleBadge role={r.key} size="lg" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    rank {r.rank}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', minHeight: 44 }}>{r.description}</div>
                <div style={{ marginTop: 10, fontSize: '0.78rem', color: r.color, fontWeight: 600 }}>
                  {count} permissions granted
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card mt-lg">
        <div className="card-title">Permission Matrix</div>
        <div className="card-sub">Every permission key and which roles hold it.</div>

        {loading && <div className="empty">Loading…</div>}

        {!loading && GROUPS.map((group) => {
          const groupRows = matrix.filter((p) => matches(p.key, group.prefixes));
          if (groupRows.length === 0) return null;
          return (
            <div key={group.label} style={{ marginTop: 20 }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)', marginBottom: 8 }}>
                {group.label}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Permission</th>
                      {allRoles.map((r) => (
                        <th key={r.key} style={{ textAlign: 'center', color: r.color }}>{r.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((row) => (
                      <tr key={row.key}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{row.key}</td>
                        {allRoles.map((r) => (
                          <td key={r.key} style={{ textAlign: 'center' }}>
                            {row.roles[r.key] ? (
                              <span style={{ color: r.color, fontWeight: 700 }}>✓</span>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
