import React, { useState, useRef, useEffect } from 'react';
import { useRole } from '../lib/roleContext.jsx';
import { ROLES } from '../lib/permissions.js';

export default function RoleSwitcher() {
  const { role, setRole, roleDetail } = useRole();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          borderRadius: 8,
          border: `1px solid ${roleDetail.color}55`,
          background: `${roleDetail.color}15`
        }}
        title="Preview as role"
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: roleDetail.color }} />
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{roleDetail.label}</span>
        <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 280,
            background: 'var(--bg-elev-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
            padding: 8,
            zIndex: 40
          }}
        >
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Preview as role
          </div>
          {Object.values(ROLES).sort((a, b) => b.rank - a.rank).map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { setRole(r.key); setOpen(false); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 8,
                background: r.key === role ? `${r.color}22` : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
              }}
              onMouseEnter={(e) => { if (r.key !== role) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { if (r.key !== role) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color, marginTop: 7, flex: 'none' }} />
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.label}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>{r.description}</div>
              </span>
              {r.key === role && <span style={{ color: r.color, fontWeight: 700 }}>✓</span>}
            </button>
          ))}
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.7rem', borderTop: '1px solid var(--border)', marginTop: 6 }}>
            Demo mode — preview what each role sees. Real auth will replace this.
          </div>
        </div>
      )}
    </div>
  );
}
