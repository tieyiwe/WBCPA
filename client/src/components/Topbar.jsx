import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SeasonPill from './SeasonPill.jsx';
import { deployAgent } from '../lib/api.js';

const TITLES = {
  '/dashboard': { title: 'Overview', sub: 'Real-time snapshot of your WBCPA Super Agent' },
  '/dashboard/calls': { title: 'Call Log', sub: 'Every inbound call, summarized' },
  '/dashboard/agent': { title: 'Voice Agent', sub: 'Deploy, tune, and inspect the Bland AI prompt' },
  '/dashboard/subscribers': { title: 'Subscribers', sub: 'Member management' },
  '/dashboard/appointments': { title: 'Appointments', sub: 'Calendar and availability' },
  '/dashboard/emails': { title: 'Emails', sub: 'AI-handled inbox and review queue' },
  '/dashboard/setup': { title: 'Setup', sub: 'Connect your APIs in Replit Secrets' }
};

export default function Topbar() {
  const location = useLocation();
  const meta = TITLES[location.pathname] || TITLES['/dashboard'];
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
      setDeployMessage({ tone: 'success', text: '✓ Agent Deployed' });
    } else if (result?.mock) {
      setDeployMessage({ tone: 'warning', text: 'Configure API Keys in Secrets' });
    } else {
      setDeployMessage({ tone: 'error', text: result?.error || 'Deploy failed' });
    }
    setTimeout(() => setDeployMessage(null), 3500);
  }

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <header className="topbar">
      <div>
        <h1>{meta.title}</h1>
        <div className="sub">{meta.sub} · {today}</div>
      </div>
      <div className="topbar-actions">
        {season && <SeasonPill seasonKey={season} />}
        <button className="btn btn-ghost" onClick={() => window.location.reload()}>↻ Refresh</button>
        <button className="btn btn-gold" onClick={handleDeploy} disabled={deploying}>
          {deploying ? (
            <>
              <span className="spinner" />
              Deploying…
            </>
          ) : deployMessage ? (
            deployMessage.text
          ) : (
            '✦ Deploy Agent'
          )}
        </button>
      </div>
    </header>
  );
}
