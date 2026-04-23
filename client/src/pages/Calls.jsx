import React, { useEffect, useState } from 'react';
import CallItem from '../components/CallItem.jsx';
import { getCalls } from '../lib/api.js';

const FILTERS = [
  { key: '', label: 'All Calls' },
  { key: 'bookings', label: 'Bookings Made' },
  { key: 'transferred', label: 'Transferred' },
  { key: 'action_needed', label: 'Action Needed' }
];

export default function Calls() {
  const [filter, setFilter] = useState('');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const resp = await getCalls(filter);
      if (active) {
        setCalls(resp?.calls || []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [filter]);

  return (
    <div className="page">
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Call Log</div>
        <div className="card-sub">
          {loading ? 'Loading…' : `${calls.length} call${calls.length === 1 ? '' : 's'} shown`}
        </div>
        {!loading && calls.length === 0 && <div className="empty">No calls match this filter.</div>}
        {calls.map((c) => <CallItem key={c.id || c.bland_call_id} call={c} />)}
      </div>
    </div>
  );
}
