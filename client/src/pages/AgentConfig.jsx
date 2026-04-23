import React, { useEffect, useState } from 'react';
import { getAgentPrompt, getVoiceStats, deployAgent } from '../lib/api.js';
import SeasonPill from '../components/SeasonPill.jsx';
import { formatDuration } from '../lib/utils.js';

const CAPABILITIES = [
  { title: 'Tax Minimization', body: 'QBI, Augusta Rule, depreciation, backdoor Roth, tax-loss harvesting, bracket management.' },
  { title: 'Real Estate & Rentals', body: '1031 exchanges, cost segregation, STR rules, REPS, BRRRR, opportunity zones.' },
  { title: 'Business Entities', body: 'LLC vs S-Corp vs C-Corp, reasonable salary, Solo 401k, holding companies.' },
  { title: 'Investment & Retirement', body: 'Mega backdoor Roth, HSA, Roth conversions, Social Security, RMDs, NUA.' }
];

const TOOLS = [
  { name: 'VerifySubscriber', body: 'Confirms caller has active subscription.' },
  { name: 'CheckAvailability', body: 'Pulls open 30-min consultation slots.' },
  { name: 'BookAppointment', body: 'Books the Google Calendar event with Meet link.' },
  { name: 'SendSMSSummary', body: 'Texts the caller a recap after the call.' },
  { name: 'transfer_call', body: 'Transfers to WB CPA staff for complex situations.' }
];

export default function AgentConfig() {
  const [prompt, setPrompt] = useState('');
  const [season, setSeason] = useState(null);
  const [stats, setStats] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([getAgentPrompt(), getVoiceStats()]);
      if (p?.prompt) { setPrompt(p.prompt); setSeason(p.season); }
      if (s) setStats(s);
    })();
  }, []);

  async function handleDeploy() {
    setDeploying(true);
    setDeployResult(null);
    const res = await deployAgent();
    setDeploying(false);
    setDeployResult(res);
  }

  return (
    <div className="page">
      <div className="card">
        <div className="flex-between gap-md" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="card-title">Agent Status</div>
            <div className="flex gap-sm" style={{ alignItems: 'center' }}>
              <span className={`status-dot`} style={{ background: stats?.agent?.online ? 'var(--success)' : 'var(--text-dim)' }} />
              <span style={{ fontWeight: 600 }}>
                {stats?.agent?.online ? 'Online' : 'Offline (Bland AI not connected)'}
              </span>
              {season && <SeasonPill seasonKey={season} />}
            </div>
            <div className="text-muted mt-sm" style={{ fontSize: '0.9rem' }}>
              {stats?.today?.calls ?? 0} calls today · avg {formatDuration(stats?.today?.avgDuration || 0)} · {stats?.today?.bookings ?? 0} bookings
            </div>
          </div>
          <button className="btn btn-gold" onClick={handleDeploy} disabled={deploying}>
            {deploying ? <><span className="spinner" />Deploying…</> : '✦ Redeploy Agent'}
          </button>
        </div>
        {deployResult && (
          <div
            className="mt-md"
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: deployResult.ok ? 'rgba(45,212,170,0.08)' : 'rgba(201,168,76,0.08)',
              border: `1px solid ${deployResult.ok ? 'rgba(45,212,170,0.3)' : 'rgba(201,168,76,0.3)'}`,
              fontSize: '0.88rem'
            }}
          >
            {deployResult.ok
              ? '✓ Agent deployed successfully.'
              : deployResult.mock
                ? 'Running in mock mode — add BLAND_API_KEY to Replit Secrets to enable live deployment.'
                : `Deploy failed: ${deployResult.error}`}
          </div>
        )}
      </div>

      <div className="grid-2 mt-lg">
        <div className="card">
          <div className="card-title">Capabilities</div>
          {CAPABILITIES.map((c) => (
            <div key={c.title} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--gold-soft)' }}>{c.title}</div>
              <div className="text-muted" style={{ fontSize: '0.88rem', marginTop: 4 }}>{c.body}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Enabled Tools</div>
          {TOOLS.map((t) => (
            <div key={t.name} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div className="mono" style={{ fontWeight: 600, color: 'var(--gold-soft)' }}>{t.name}</div>
              <div className="text-muted" style={{ fontSize: '0.88rem', marginTop: 4 }}>{t.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-lg">
        <div className="card-title">System Prompt Preview</div>
        <div className="card-sub">Deployed to Bland AI — auto-updates with current tax season tone.</div>
        <div className="prompt-box">{prompt || 'Loading…'}</div>
      </div>
    </div>
  );
}
