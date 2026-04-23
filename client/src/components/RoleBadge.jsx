import React from 'react';
import { ROLES } from '../lib/permissions.js';

export default function RoleBadge({ role, size = 'sm' }) {
  const detail = ROLES[role];
  if (!detail) return null;
  const padY = size === 'lg' ? '4px' : '2px';
  const padX = size === 'lg' ? '10px' : '7px';
  const fontSize = size === 'lg' ? '0.78rem' : '0.68rem';
  return (
    <span
      className="role-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: `${padY} ${padX}`,
        borderRadius: 999,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: `${detail.color}22`,
        border: `1px solid ${detail.color}55`,
        color: detail.color
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: detail.color }} />
      {detail.label}
    </span>
  );
}
