import React from 'react';

export const SEASON_LABELS = {
  PEAK_SEASON: 'Peak Season',
  EXTENSION: 'Extension',
  PRE_FILING: 'Pre-Filing'
};

const COLORS = {
  PEAK_SEASON: '#f97316',
  EXTENSION: '#3b82f6',
  PRE_FILING: '#c9a84c'
};

export default function SeasonPill({ seasonKey }) {
  if (!seasonKey) return null;
  const color = COLORS[seasonKey] || 'var(--gold)';
  return (
    <span
      className="season-pill"
      style={{ borderColor: color, color }}
      title="Current WBCPA tax season tone"
    >
      <span className="dot" style={{ background: color }} />
      {SEASON_LABELS[seasonKey] || seasonKey}
    </span>
  );
}
