import React, { useEffect, useState } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import SeasonPill from './SeasonPill.jsx';
import RoleSwitcher from './RoleSwitcher.jsx';
import { deployAgent } from '../lib/api.js';

const TITLES = {
  '/dashboard': { title: 'Overview', sub: 'Real-time snapshot of your WBCPA Super Agent' },
  '/dashboard/calls': { title: 'Call Log', sub: 'Every inbound call, summarized' },
  '/dashboard/agent': { title: 'Voice Agent', sub: 'Deploy, tune, and inspect the Bland AI prompt' },
  '/dashboard/subscribers': { title: 'Subscribers', sub: 'Member management' },
  '/dashboard/appointments': { title: 'Appointments', sub: 'Calendar and availability' },
  '/dashboard/emails': { title: 'Emails', sub: 'AI-handled inbox and review queue' },
  '/dashboard/setup': { title: 'Setup', sub: 'Connect your APIs in Replit Secrets' },
  '/dashboard/profile': { title: 'My Profile', sub: 'Personal info, notification preferences, and your workspace summary' },
  '/dashboard/escalations': { title: 'Escalations', sub: 'Calls and emails the AI handed off to a human — accept and take over' },
  '/dashboard/admin': { title: 'Admin Panel', sub: 'Team, roles, collaboration, and system settings' },
  '/dashboard/admin/team': { title: 'Team Members', sub: 'Invite, edit, and manage access' },
  '/dashboard/admin/roles': { title: 'Roles & Permissions', sub: 'What each role can do' },
  '/dashboard/admin/activity': { title: 'Activity Log', sub: 'Audit trail of every action taken' },
  '/dashboard/admin/tasks': { title: 'Task Board', sub: 'Assign work across the team' },
  '/dashboard/admin/collaboration': { title: 'Collaboration Hub', sub: 'Internal notes, mentions, and discussion' },
  '/dashboard/admin/settings': { title: 'System Settings', sub: 'Integrations, API keys, and preferences' },
  '/dashboard/taxdocs': { title: 'Tax Documents', sub: 'Upload, review, approve, e-sign, and file tax documents' },
  '/dashboard/rich': { title: 'Rich — AI Tax Advisor', sub: 'Ask anything about clients, tax strategy, IRS guidance, or documents' }
};

function resolveTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const keys = Object.keys(TITLES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (matchPath({ path: k, end: false }, pathname)) return TITLES[k];
  }
  return TITLES['/dashboard'];
}

export default function Topbar() {
  const location = useLocation();
  const meta = resolveTitle(location.pathname);
  const [season, setSeason] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch('/api/voice/prompt');
        const data = await resp.json();
        if (mounted && data?.season) setSeason(data.season);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleDeploy() {
    setDeploying(true);
    setDeployMessage(null);
    const result = await deployAgent();
    setDeploying(false);
    if (result?.ok) {
      setDeployMessage({
        tone: 'success',
        text: '✓ Agent Deployed',
        detail: result.agent_id ? `Bland agent_id: ${result.agent_id}${result.season ? ` · season: ${result.season}` : ''}` : 'Voice agent is live on Bland.'
      });
    } else if (result?.mock) {
      setDeployMessage({
        tone: 'warning',
        text: '⚠ Bland not configured',
        detail: result.message || 'Add BLAND_API_KEY to Replit Secrets, then restart.'
      });
    } else {
      setDeployMessage({
        tone: 'error',
        text: '✕ Deploy failed',
        detail: result?.error || 'See server logs for the Bland API response.'
      });
    }
    setTimeout(() => setDeployMessage(null), 8000);
  }

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const toneColor = deployMessage?.tone === 'success' ? 'var(--success)'
                  : deployMessage?.tone === 'warning' ? 'var(--warning)'
                  : deployMessage?.tone === 'error'   ? 'var(--error)'
                  : 'var(--gold)';

  return (
    <header className="topbar" style={{ position: 'relative' }}>
      <div>
        <h1>{meta.title}</h1>
        <div className="sub">{meta.sub} · {today}</div>
      </div>
      <div className="topbar-actions">
        {season && <SeasonPill seasonKey={season} />}
        <RoleSwitcher />
        <button className="btn btn-ghost" onClick={() => window.location.reload()}>↻ Refresh</button>
        <button className="btn btn-gold" onClick={handleDeploy} disabled={deploying}>
          {deploying ? (
            <>
              <span className="spinner" />
              Deploying…
            </>
          ) : (
            '✦ Deploy Agent'
          )}
        </button>
      </div>

      {deployMessage && (
        <div style={{
          position: 'absolute', top: '100%', right: 24, marginTop: 8, zIndex: 50,
          background: 'var(--bg-elev-1)', border: `1px solid ${toneColor}`,
          borderRadius: 10, padding: '12px 16px', minWidth: 280, maxWidth: 420,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <strong style={{ color: toneColor }}>{deployMessage.text}</strong>
            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.78rem' }}
              onClick={() => setDeployMessage(null)}>✕</button>
          </div>
          {deployMessage.detail && (
            <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {deployMessage.detail}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
