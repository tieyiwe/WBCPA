import React, { useEffect, useState } from 'react';
import EmailQueueItem from '../components/EmailQueueItem.jsx';
import { getEmailQueue, getEmails, resolveEmail, syncInbox } from '../lib/api.js';
import { timeAgo } from '../lib/utils.js';

export default function Emails() {
  const [queue, setQueue] = useState([]);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    setLoading(true);
    const [q, e] = await Promise.all([getEmailQueue(), getEmails()]);
    setQueue(q?.queue || []);
    setEmails(e?.emails || []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleResolve(item, reply) {
    await resolveEmail(item.id, reply, null, item.subject);
    refresh();
  }

  async function handleSync() {
    setSyncing(true);
    await syncInbox();
    setSyncing(false);
    refresh();
  }

  const sent = emails.filter((e) => e.status === 'sent');

  return (
    <div className="page">
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Review Queue</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              {loading ? 'Loading…' : `${queue.length} item${queue.length === 1 ? '' : 's'} flagged for human review`}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={handleSync} disabled={syncing}>
            {syncing ? <><span className="spinner" />Syncing…</> : '↻ Sync Inbox'}
          </button>
        </div>

        {queue.length === 0 && !loading && (
          <div className="empty">Review queue is clear. ✓</div>
        )}
        {queue.map((item) => (
          <EmailQueueItem key={item.id} item={item} onResolve={handleResolve} />
        ))}
      </div>

      <div className="card mt-lg">
        <div className="card-title">Recent Auto-Sent Emails</div>
        <div className="card-sub">AI-drafted replies that were sent automatically.</div>

        {sent.length === 0 && <div className="empty">No auto-sent emails yet.</div>}

        {sent.map((e) => (
          <div key={e.id} className="list-item" style={{ cursor: 'default' }}>
            <div className="avatar" style={{ background: 'linear-gradient(135deg, var(--success) 0%, #139676 100%)', color: '#0a0d14' }}>
              ✓
            </div>
            <div className="body">
              <div className="row1">
                <div className="name">{e.subject}</div>
                <span className="badge badge-green">sent</span>
              </div>
              <div className="summary">{e.client_name} — {e.client_email}</div>
              <div className="meta">
                <span>{timeAgo(e.sent_at || e.received_at)}</span>
                {e.classification && <><span>·</span><span className="badge badge-muted">{e.classification}</span></>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
