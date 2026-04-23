import React, { useState } from 'react';
import { initials, formatPhone, formatDuration, timeAgo } from '../lib/utils.js';

export default function CallItem({ call }) {
  const [open, setOpen] = useState(false);

  const badges = [];
  if (call.booking_made) badges.push({ label: 'Booked', cls: 'badge-green' });
  if (call.transferred) badges.push({ label: 'Transferred', cls: 'badge-blue' });
  if (call.action_needed) badges.push({ label: 'Action Needed', cls: 'badge-red' });
  if (call.sms_sent) badges.push({ label: 'SMS Sent', cls: 'badge-muted' });

  return (
    <div className="list-item" onClick={() => setOpen(!open)}>
      <div className="avatar">{initials(call.client_name)}</div>
      <div className="body">
        <div className="row1">
          <div className="name">{call.client_name || 'Unknown Caller'}</div>
          <div className="phone">{formatPhone(call.caller_number)}</div>
          {badges.map((b) => (
            <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>
          ))}
        </div>
        <div className="summary">{call.summary || 'No summary available.'}</div>
        <div className="meta">
          <span>{timeAgo(call.called_at)}</span>
          <span>·</span>
          <span>{formatDuration(call.duration_seconds)}</span>
          {call.recording_url && (
            <>
              <span>·</span>
              <a href={call.recording_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                Recording
              </a>
            </>
          )}
        </div>
        {open && call.transcript && (
          <div className="prompt-box" style={{ marginTop: 12, maxHeight: 240 }}>
            {call.transcript}
          </div>
        )}
      </div>
    </div>
  );
}
