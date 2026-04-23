import React from 'react';
import { formatET, formatPhone } from '../lib/utils.js';

export default function AppointmentRow({ appt, onCancel }) {
  const badgeCls = appt.status === 'confirmed'
    ? 'badge-green'
    : appt.status === 'cancelled'
      ? 'badge-red'
      : 'badge-muted';

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{appt.client_name || '—'}</div>
        <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {formatPhone(appt.client_phone)}
        </div>
      </td>
      <td className="mono">{formatET(appt.scheduled_at)}</td>
      <td>{appt.topic || '—'}</td>
      <td>
        {appt.meet_link ? (
          <a href={appt.meet_link} target="_blank" rel="noreferrer">Meet link</a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        <span className={`badge ${badgeCls}`}>{appt.status}</span>
      </td>
      <td>
        {appt.status === 'confirmed' && (
          <button
            className="btn btn-danger"
            style={{ padding: '6px 10px' }}
            onClick={() => onCancel && onCancel(appt)}
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
}
