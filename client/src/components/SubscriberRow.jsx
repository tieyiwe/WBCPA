import React from 'react';
import { formatPhone, timeAgo, tierColor, statusColor } from '../lib/utils.js';

export default function SubscriberRow({ sub, onEdit }) {
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{sub.name || '—'}</div>
        <div className="mono" style={{ fontSize: '0.76rem' }}>{sub.id}</div>
      </td>
      <td>
        <div>{sub.email || '—'}</div>
        <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {formatPhone(sub.phone)}
        </div>
      </td>
      <td>
        <span className={`badge badge-${tierColor(sub.tier)}`}>{sub.tier || 'standard'}</span>
      </td>
      <td>
        <span className={`badge badge-${statusColor(sub.status)}`}>{sub.status || '—'}</span>
      </td>
      <td className="mono">{sub.call_count ?? 0}</td>
      <td>{timeAgo(sub.last_call)}</td>
      <td>{timeAgo(sub.subscribed_at || sub.created_at)}</td>
      <td>
        <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => onEdit && onEdit(sub)}>
          Edit
        </button>
      </td>
    </tr>
  );
}
