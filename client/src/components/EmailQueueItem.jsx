import React, { useState } from 'react';
import { timeAgo } from '../lib/utils.js';

export default function EmailQueueItem({ item, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');

  const urgency = (item.urgency || 'low').toLowerCase();

  return (
    <div className={`queue-item ${urgency}`}>
      <div className="strip" />
      <div>
        <div className="subject">{item.subject}</div>
        <div className="reason">{item.reason_flagged}</div>
        <div className="meta mt-sm" style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
          {item.client_name} · {timeAgo(item.created_at)} ·{' '}
          <span className={`badge badge-${urgency === 'high' ? 'red' : urgency === 'medium' ? 'orange' : 'blue'}`}>
            {urgency}
          </span>
        </div>
        {expanded && (
          <textarea
            className="input"
            placeholder="Type reply (optional)…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            style={{ marginTop: 10 }}
          />
        )}
      </div>
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : 'Reply'}
        </button>
        <button className="btn btn-gold" onClick={() => onResolve && onResolve(item, reply)}>
          Resolve
        </button>
      </div>
    </div>
  );
}
