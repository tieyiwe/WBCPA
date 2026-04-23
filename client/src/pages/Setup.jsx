import React from 'react';

const SECRETS = [
  { key: 'PORT', note: 'Default: 3000 — Replit injects this automatically' },
  { key: 'JWT_SECRET', note: 'Any long random string (use `openssl rand -hex 32`)' },
  { key: 'INTERNAL_API_KEY', note: 'Random string that Bland AI sends with x-api-key' },
  { key: 'REPLIT_URL', note: 'Your public Replit URL (https://…repl.co)' },
  { key: 'SUPABASE_URL', note: 'Supabase project settings → API' },
  { key: 'SUPABASE_SERVICE_KEY', note: 'Supabase service_role key (keep secret!)' },
  { key: 'BLAND_API_KEY', note: 'app.bland.ai → Settings → API Keys' },
  { key: 'BLAND_AGENT_ID', note: 'Leave blank — auto-populated on first deploy' },
  { key: 'TWILIO_ACCOUNT_SID', note: 'twilio.com → Account Dashboard' },
  { key: 'TWILIO_AUTH_TOKEN', note: 'twilio.com → Account Dashboard' },
  { key: 'TWILIO_PHONE_NUMBER', note: 'Number clients will call (e.g. +1…)' },
  { key: 'OPENAI_API_KEY', note: 'platform.openai.com → API Keys' },
  { key: 'GOOGLE_CLIENT_ID', note: 'Google Cloud Console → OAuth 2.0 Client ID' },
  { key: 'GOOGLE_CLIENT_SECRET', note: 'Same OAuth client, secret tab' },
  { key: 'GOOGLE_REDIRECT_URI', note: `${window.location.origin}/api/auth/google/callback` },
  { key: 'GOOGLE_REFRESH_TOKEN', note: 'Obtain via OAuth playground with calendar + gmail scopes' },
  { key: 'GOOGLE_CALENDAR_ID', note: 'Usually `primary`' },
  { key: 'WBCPA_STAFF_EMAIL', note: 'Inbox the agent escalates to (e.g. staff@wbcpa.com)' },
  { key: 'WBCPA_STAFF_PHONE', note: 'Number the agent transfers calls to (e.g. +1…)' }
];

export default function Setup() {
  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title">Welcome, WB CPA</div>
        <div className="card-sub">
          The app is already running in mock mode — nothing blocks you from exploring the UI.
          Follow the steps below to connect live services when you're ready.
        </div>
      </div>

      <div className="step-card">
        <div className="step-num">1</div>
        <h3>Add secrets in Replit</h3>
        <p className="text-muted" style={{ fontSize: '0.92rem' }}>
          Open your Repl → Tools → Secrets, and add the following variables.
          The app degrades gracefully to mock data for anything you leave blank.
        </p>
        <div className="table-wrap mt-md">
          <table>
            <thead><tr><th>Key</th><th>Where to find / what to set</th></tr></thead>
            <tbody>
              {SECRETS.map((s) => (
                <tr key={s.key}>
                  <td className="mono" style={{ color: 'var(--gold-soft)' }}>{s.key}</td>
                  <td className="text-muted">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="step-card">
        <div className="step-num">2</div>
        <h3>Provision Supabase</h3>
        <p className="text-muted" style={{ fontSize: '0.92rem' }}>
          Create a Supabase project and paste the contents of{' '}
          <code style={{ background: 'var(--bg-elev-2)', padding: '2px 6px', borderRadius: 4 }}>database_schema.sql</code>{' '}
          into the SQL editor. Run it once — tables, indexes, and seed config will be created.
        </p>
        <p className="text-muted" style={{ fontSize: '0.92rem' }}>
          Then copy <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_KEY</code> into Replit Secrets.
        </p>
      </div>

      <div className="step-card">
        <div className="step-num">3</div>
        <h3>Connect Twilio + Bland AI</h3>
        <ol className="text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.8 }}>
          <li>Buy a phone number in Twilio and paste it into <code>TWILIO_PHONE_NUMBER</code>.</li>
          <li>Paste <code>TWILIO_ACCOUNT_SID</code> and <code>TWILIO_AUTH_TOKEN</code>.</li>
          <li>Create a Bland AI account and copy your <code>BLAND_API_KEY</code>.</li>
          <li>In Bland AI, purchase/attach the Twilio number and point it at your WBCPA agent.</li>
          <li>Click <strong>Deploy Agent</strong> in the top-right of the dashboard — this uploads the prompt and tools.</li>
          <li>Set the webhook in Bland AI to <code>{typeof window !== 'undefined' ? window.location.origin : 'https://your-repl.replit.app'}/api/webhooks/bland/call-ended</code>.</li>
        </ol>
      </div>

      <div className="step-card">
        <div className="step-num">4</div>
        <h3>Google Calendar + Gmail (OAuth)</h3>
        <ol className="text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.8 }}>
          <li>Enable the Gmail API and Google Calendar API in Google Cloud Console.</li>
          <li>Create an OAuth 2.0 Client ID (Web application).</li>
          <li>Authorize the redirect URI <code>{typeof window !== 'undefined' ? window.location.origin : 'https://your-repl.replit.app'}/api/auth/google/callback</code>.</li>
          <li>Use the OAuth Playground to generate a <code>refresh_token</code> with Gmail + Calendar scopes, and paste it into <code>GOOGLE_REFRESH_TOKEN</code>.</li>
        </ol>
      </div>

      <div className="step-card">
        <div className="step-num">5</div>
        <h3>Run it</h3>
        <p className="text-muted" style={{ fontSize: '0.92rem' }}>
          Replit runs the app with <code>npm start</code>, which builds the React app then starts Express on port 3000.
          Click <strong>Run</strong> — the UI is served at your Repl URL and the API at <code>/api/*</code>.
        </p>
        <div className="prompt-box" style={{ maxHeight: 120 }}>
{`npm install
npm start`}
        </div>
      </div>
    </div>
  );
}
