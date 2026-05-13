import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getEscalationSummary } from '../lib/api.js';

// App-wide watcher: polls escalation summary every 10s. When `open` count
// goes UP (a new item arrived since the last poll), plays a chime + shows
// a slide-in toast that links to /dashboard/escalations.
// Mounted once at the layout level so it works on every page.

export default function EscalationWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState(null);
  const prevOpenRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function tick() {
      const data = await getEscalationSummary().catch(() => null);
      if (!mounted || !data?.summary) return;
      const open = data.summary.open ?? 0;
      const prev = prevOpenRef.current;

      // First poll just establishes baseline — no toast on initial mount
      if (!initializedRef.current) {
        prevOpenRef.current = open;
        initializedRef.current = true;
        return;
      }

      if (prev != null && open > prev) {
        const delta = open - prev;
        playChime();
        // Don't show the toast if the user is already looking at the page
        if (!location.pathname.startsWith('/dashboard/escalations')) {
          setToast({
            count: open,
            delta,
            timestamp: Date.now()
          });
          // Auto-dismiss after 12s
          setTimeout(() => {
            setToast((current) => (current && Date.now() - current.timestamp >= 12000 ? null : current));
          }, 12000);
        }
      }
      prevOpenRef.current = open;
    }

    tick();
    const interval = setInterval(tick, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [location.pathname]);

  if (!toast) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 20, zIndex: 100,
      background: 'var(--bg-elev-1)', border: '1px solid var(--error)',
      borderLeft: '4px solid var(--error)',
      borderRadius: 12, padding: '14px 18px',
      boxShadow: '0 10px 32px rgba(0,0,0,0.12)',
      width: 'min(360px, calc(100vw - 40px))',
      animation: 'milton-pop-in 0.25s ease-out',
      display: 'flex', flexDirection: 'column', gap: 6
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: 'var(--error)',
          boxShadow: '0 0 0 4px rgba(184,58,38,0.25)'
        }} />
        <strong style={{ color: 'var(--error)', flex: 1 }}>
          {toast.delta > 1 ? `${toast.delta} new escalations` : 'New escalation'}
        </strong>
        <button onClick={() => setToast(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, fontSize: '0.95rem' }}>
          ✕
        </button>
      </div>
      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
        {toast.count} open in the queue. The AI agent just flagged something for a human to handle.
      </div>
      <div style={{ marginTop: 4 }}>
        <button
          className="btn btn-gold"
          style={{ padding: '6px 12px', fontSize: '0.82rem' }}
          onClick={() => {
            navigate('/dashboard/escalations?scope=open');
            setToast(null);
          }}
        >
          Open queue →
        </button>
      </div>
    </div>
  );
}

// Browser-native chime via WebAudio. Two short notes that fade out — distinct
// enough to grab attention without being obnoxious. No audio file dependency.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, dur: 0.18 },   // A5
      { freq: 1320, start: 0.16, dur: 0.32 } // E6
    ];
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    });
    // Auto-close to free the audio context after the chime
    setTimeout(() => { ctx.close(); }, 1000);
  } catch {
    /* audio is best-effort; never block on a chime */
  }
}
