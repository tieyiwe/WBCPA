import React, { useEffect, useState } from 'react';
import { getConnectionStatus } from '../lib/api.js';

export default function BlandConnection() {
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await getConnectionStatus();
      if (data && !data.error) setStatus(data);
    })();
  }, []);

  function copy(value, key) {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  }

  if (!status) return <div className="card"><div className="empty">Loading connection status…</div></div>;

  const blandConnected = status.bland?.configured;
  const twilioConnected = status.twilio?.configured;
  const overallReady = blandConnected && twilioConnected;

  return (
    <div className="card">
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>Bland AI Connection</div>
          <div className="card-sub" style={{ marginTop: 2 }}>
            How your phone number, voice agent, and webhooks are wired up.
          </div>
        </div>
        <span className={`badge ${overallReady ? 'badge-green' : blandConnected ? 'badge-orange' : 'badge-red'}`}>
          {overallReady ? '✓ Ready for live calls' : blandConnected ? 'Partially connected' : 'Not connected'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
        <StatusTile
          label="Bland AI"
          state={blandConnected ? 'ok' : 'off'}
          detail={blandConnected
            ? (status.bland.agent_id_set ? `Agent: ${status.bland.agent_id}` : 'Key set, agent not yet deployed')
            : 'Set BLAND_API_KEY in Secrets'} />
        <StatusTile
          label="Twilio (SMS)"
          state={twilioConnected ? 'ok' : 'off'}
          detail={twilioConnected
            ? `From: ${status.twilio.phone_number}`
            : 'Set TWILIO_ACCOUNT_SID, AUTH_TOKEN, PHONE_NUMBER'} />
        <StatusTile
          label="Internal API key"
          state={status.requires_internal_key ? 'ok' : 'warn'}
          detail={status.requires_internal_key
            ? 'INTERNAL_API_KEY is set'
            : 'Using dev fallback — set INTERNAL_API_KEY for production'} />
        <StatusTile
          label="Public URL"
          state={status.base_url?.startsWith('https') ? 'ok' : 'warn'}
          detail={status.base_url || '—'} />
      </div>

      {/* Webhooks */}
      <div style={{ marginTop: 18 }}>
        <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)', marginBottom: 8 }}>
          Paste these URLs into Bland AI
        </div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          The agent calls these endpoints during live calls. They include an <code style={{ background: 'var(--bg-elev-2)', padding: '1px 5px', borderRadius: 3 }}>x-api-key</code> header
          checked against your <code>INTERNAL_API_KEY</code>.
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Endpoint</th>
                <th>URL</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              <UrlRow label="Call-ended webhook"   url={status.webhooks.call_ended}        copy={copy} copied={copied} keyName="call_ended"
                      sub="In Bland: agent → webhook → paste this here." />
              <UrlRow label="Verify subscriber"    url={status.webhooks.verify_subscriber} copy={copy} copied={copied} keyName="verify"
                      sub="Bland's VerifySubscriber tool POSTs here." />
              <UrlRow label="Check availability"   url={status.webhooks.check_availability} copy={copy} copied={copied} keyName="avail"
                      sub="CheckAvailability tool — pulls open consult slots." />
              <UrlRow label="Book appointment"     url={status.webhooks.book_appointment}   copy={copy} copied={copied} keyName="book"
                      sub="BookAppointment tool — creates the Google Calendar event." />
              <UrlRow label="Send SMS recap"       url={status.webhooks.send_sms}           copy={copy} copied={copied} keyName="sms"
                      sub="SendSMSSummary tool — texts the caller a recap." />
            </tbody>
          </table>
        </div>
      </div>

      {/* Setup checklist */}
      <div style={{ marginTop: 18 }}>
        <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', color: 'var(--gold-soft)', marginBottom: 8 }}>
          Activation checklist
        </div>
        <Step done={blandConnected} text="Add BLAND_API_KEY to Replit Secrets" />
        <Step done={status.bland.agent_id_set}
              text="Click 'Deploy Agent' in the top-right (sets BLAND_AGENT_ID automatically)" />
        <Step done={twilioConnected} text="Buy a Twilio number and add TWILIO_ACCOUNT_SID, AUTH_TOKEN, PHONE_NUMBER" />
        <Step done={false}
              text="In Bland AI, attach your Twilio number to the deployed agent" />
        <Step done={false}
              text={<>Paste the call-ended webhook URL into Bland AI's agent settings → <code>{status.webhooks.call_ended}</code></>} />
        <Step done={status.requires_internal_key} text="Set INTERNAL_API_KEY (any random string) so tool callbacks are authenticated" />
        <Step done={false} text="Place a test call to your Twilio number — should land in /dashboard/calls" />
      </div>

      <div style={{ marginTop: 14, padding: 12, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, fontSize: '0.86rem' }}>
        <strong style={{ color: 'var(--info)' }}>Outbound calls are also enabled.</strong> Open the Call Log and click any row's
        "Call back via agent" button — Bland will dial the customer using this same agent. You can also use the
        "Place outbound call" button to dial any number from scratch.
      </div>
    </div>
  );
}

function StatusTile({ label, state, detail }) {
  const colors = {
    ok:   { bg: 'rgba(45,212,170,0.08)', border: 'rgba(45,212,170,0.35)', dot: 'var(--success)' },
    warn: { bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.35)', dot: 'var(--warning)' },
    off:  { bg: 'rgba(122,131,153,0.06)', border: 'var(--border)',         dot: 'var(--text-dim)' }
  };
  const c = colors[state];
  return (
    <div className="card" style={{ padding: 12, background: c.bg, borderColor: c.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot }} />
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{label}</span>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', wordBreak: 'break-all' }}>{detail}</div>
    </div>
  );
}

function UrlRow({ label, url, sub, copy, copied, keyName }) {
  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>{sub}</div>}
      </td>
      <td>
        <code style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
          color: 'var(--gold-soft)', wordBreak: 'break-all'
        }}>{url}</code>
      </td>
      <td>
        <button className="btn btn-ghost" onClick={() => copy(url, keyName)} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
          {copied === keyName ? 'Copied ✓' : 'Copy'}
        </button>
      </td>
    </tr>
  );
}

function Step({ done, text }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'flex-start' }}>
      <div style={{
        width: 18, height: 18, borderRadius: 4, flex: 'none',
        background: done ? 'var(--success)' : 'transparent',
        border: `1px solid ${done ? 'var(--success)' : 'var(--border-strong)'}`,
        color: '#0a0d14', fontWeight: 700, textAlign: 'center', fontSize: '0.76rem', lineHeight: '16px'
      }}>{done ? '✓' : ''}</div>
      <div style={{ fontSize: '0.86rem', color: done ? 'var(--text)' : 'var(--text-muted)', lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}
