import React from 'react';

export default function StatCard({ icon, label, value, sub, tone = 'gold', change }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="accent" />
      {icon && <div className="icon">{icon}</div>}
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {change && (
        <div className="sub" style={{ color: change.startsWith('-') ? 'var(--error)' : 'var(--success)' }}>
          {change}
        </div>
      )}
    </div>
  );
}
