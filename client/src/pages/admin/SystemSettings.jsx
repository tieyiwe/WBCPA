import React, { useEffect, useState } from 'react';
import { getSettings, updateSettings, rotateApiKey } from '../../lib/api.js';
import { useRole } from '../../lib/roleContext.jsx';
import { AccessDenied } from '../../components/PermissionGate.jsx';
import { timeAgo } from '../../lib/utils.js';

export default function SystemSettings() {
  const { can } = useRole();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!can('system.settings.view')) return <AccessDenied permission="system.settings.view" />;

  async function refresh() {
    const data = await getSettings();
    if (data?.settings) setSettings(data.settings);
    if (data?.error) setError(data.error);
  }

  useEffect(() => { refresh(); }, []);

  async function toggle(key) {
    setSaving(true);
    const resp = await updateSettings({ [key]: !settings[key] });
    if (resp?.settings) setSettings(resp.settings);
    if (resp?.error) setError(resp.error);
    setSaving(false);
  }

  async function updateNumber(key, value) {
    setSaving(true);
    const n = Number(value);
    if (Number.isFinite(n)) {
      const resp = await updateSettings({ [key]: n });
      if (resp?.settings) setSettings(resp.settings);
    }
    setSaving(false);
  }

  async function updateBranding(key, value) {
    setSaving(true);
    const resp = await updateSettings({ branding: { [key]: value } });
    if (resp?.settings) setSettings(resp.settings);
    setSaving(false);
  }

  async function handleRotate(id) {
    if (!confirm('Rotate this API key? The old key will stop working immediately.')) return;
    const resp = await rotateApiKey(id);
    if (resp?.error) setError(resp.error);
    refresh();
  }

  if (!settings) return <div className="card"><div className="empty">Loading settings…</div></div>;

  const canEdit = can('system.settings.edit');

  return (
    <div>
      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginBottom: 14 }}>
          {error}
          <button className="btn btn-ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Feature flags */}
      <div className="card">
        <div className="card-title">Feature flags</div>
        <div className="card-sub">Turn core behaviors on or off for the whole firm.</div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toggle label="Auto-send email replies"
            sub="When off, all AI-drafted replies go to the review queue instead of sending."
            checked={settings.auto_send_enabled}
            disabled={!canEdit || saving}
            onChange={() => toggle('auto_send_enabled')} />
          <Toggle label="Voice agent enabled"
            sub="Master switch for the inbound Bland AI call agent."
            checked={settings.voice_agent_enabled}
            disabled={!canEdit || saving}
            onChange={() => toggle('voice_agent_enabled')} />
          <Toggle label="Require 2FA for team members"
            sub="Enforces TOTP-based two-factor auth on every staff login."
            checked={settings.require_2fa}
            disabled={!canEdit || saving}
            onChange={() => toggle('require_2fa')} />
          <Toggle label="Allow invite-based signup"
            sub="When off, only the Owner can add new members — no invite links."
            checked={settings.allow_invite_sign_up}
            disabled={!canEdit || saving}
            onChange={() => toggle('allow_invite_sign_up')} />
        </div>
      </div>

      {/* Numeric preferences */}
      <div className="card mt-lg">
        <div className="card-title">Operational preferences</div>
        <div className="card-sub">Timing and default values for automation.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          <NumField label="Inbox scan interval"
            suffix="minutes"
            value={settings.inbox_scan_interval_min}
            disabled={!canEdit || saving}
            onSave={(v) => updateNumber('inbox_scan_interval_min', v)} />
          <NumField label="Daily reminder hour"
            suffix="0–23 (ET)"
            value={settings.daily_reminder_hour}
            disabled={!canEdit || saving}
            onSave={(v) => updateNumber('daily_reminder_hour', v)} />
          <NumField label="Default appointment"
            suffix="minutes"
            value={settings.default_appointment_duration_min}
            disabled={!canEdit || saving}
            onSave={(v) => updateNumber('default_appointment_duration_min', v)} />
        </div>
      </div>

      {/* Branding */}
      <div className="card mt-lg">
        <div className="card-title">Branding</div>
        <div className="card-sub">How the app presents itself to your clients.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
          <TextField label="Agent name" value={settings.branding.agent_name}
            disabled={!canEdit} onSave={(v) => updateBranding('agent_name', v)} />
          <TextField label="Firm name" value={settings.branding.firm_name}
            disabled={!canEdit} onSave={(v) => updateBranding('firm_name', v)} />
          <TextField label="Primary color" value={settings.branding.primary_color}
            disabled={!canEdit} onSave={(v) => updateBranding('primary_color', v)} />
        </div>
      </div>

      {/* Integrations */}
      <div className="card mt-lg">
        <div className="card-title">Integrations</div>
        <div className="card-sub">Status of every external service. Configure keys in your host secrets panel.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
          {Object.entries(settings.integrations).map(([key, info]) => (
            <div key={key} className="card" style={{
              padding: 12,
              borderColor: info.connected ? 'rgba(45,212,170,0.35)' : 'var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{info.label}</span>
                {info.connected ? (
                  <span className="badge badge-green">Connected</span>
                ) : info.required ? (
                  <span className="badge badge-orange">Not connected</span>
                ) : (
                  <span className="badge badge-muted">Optional</span>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {info.connected ? `Last checked ${timeAgo(info.last_checked)}` : info.required ? 'Add API key in your secrets panel' : 'Not configured'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys */}
      {can('api_keys.view') && (
        <div className="card mt-lg">
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 0 }}>Internal API keys</div>
              <div className="card-sub" style={{ marginTop: 2 }}>Used by Bland AI callbacks and internal services.</div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Key</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {settings.api_keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{k.last_four}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{timeAgo(k.created_at)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{timeAgo(k.last_used_at)}</td>
                    <td>
                      {k.status === 'active'
                        ? <span className="badge badge-green">Active</span>
                        : <span className="badge badge-muted">Revoked</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {can('api_keys.rotate') && k.status === 'active' && (
                        <button className="btn btn-ghost" onClick={() => handleRotate(k.id)}>Rotate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, sub, checked, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>{sub}</div>
      </div>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        style={{
          width: 44, height: 24,
          borderRadius: 999,
          background: checked ? 'var(--gold)' : 'var(--bg-elev-3)',
          border: '1px solid var(--border)',
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'background 0.15s',
          flex: 'none'
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2, left: checked ? 22 : 2,
          width: 18, height: 18,
          borderRadius: 999,
          background: checked ? '#fff' : 'var(--text)',
          transition: 'left 0.15s'
        }} />
      </button>
    </div>
  );
}

function NumField({ label, value, suffix, onSave, disabled }) {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          className="input"
          value={val}
          disabled={disabled}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { if (Number(val) !== value) onSave(val); }}
          style={{ width: 100 }}
        />
        {suffix && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function TextField({ label, value, onSave, disabled }) {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <input
        type="text"
        className="input"
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if (val !== value) onSave(val); }}
        style={{ width: '100%' }}
      />
    </div>
  );
}
