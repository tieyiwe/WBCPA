import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  getTaxDocs, uploadTaxDoc, processTaxDoc, approveTaxDoc, rejectTaxDoc,
  sendTaxDocForSignature, recordTaxDocSigned, markTaxDocFiled, addTaxDocNote,
  bulkUploadTaxDocs, getTaxDocClients, createUploadLink
} from '../lib/api.js';
import { useRole } from '../lib/roleContext.jsx';
import { AccessDenied } from '../components/PermissionGate.jsx';
import { timeAgo, formatPhone } from '../lib/utils.js';

const DOC_TYPES = ['W-2', '1099-NEC', '1099-K', '1099-MISC', 'K-1', '1040', 'Schedule-C', 'other'];
const TAX_YEARS = [2024, 2023, 2022, 2021];

const STATUS_META = {
  uploaded:           { label: 'Uploaded',          color: 'var(--text-muted)',  step: 1 },
  processing:         { label: 'AI Processing',      color: 'var(--info)',        step: 2 },
  review:             { label: 'Needs Review',       color: 'var(--warning)',     step: 3 },
  approved:           { label: 'Approved',           color: 'var(--gold)',        step: 4 },
  awaiting_signature: { label: 'Awaiting Signature', color: 'var(--error)',       step: 5 },
  signed:             { label: 'Signed',             color: 'var(--success)',     step: 6 },
  filed:              { label: 'Filed ✓',            color: 'var(--success)',     step: 7 },
  rejected:           { label: 'Rejected',           color: 'var(--error)',       step: 0 }
};

const WORKFLOW_STEPS = [
  { key: 'uploaded',           label: 'Upload' },
  { key: 'processing',         label: 'AI Extract' },
  { key: 'review',             label: 'Review' },
  { key: 'approved',           label: 'Approve' },
  { key: 'awaiting_signature', label: 'E-Sign' },
  { key: 'signed',             label: 'Signed' },
  { key: 'filed',              label: 'Filed' }
];

export default function TaxDocs() {
  const { can } = useRole();
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState([]);
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ status: params.get('status') || '', tax_year: '', doc_type: '' });
  const [view, setView] = useState(params.get('view') || 'docs'); // 'docs' | 'clients'
  const [showUpload, setShowUpload] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [linkModalClient, setLinkModalClient] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const canView = can('taxdocs.view');

  async function refresh() {
    if (!canView) return;
    setLoading(true);
    const p = {};
    if (filter.status) p.status = filter.status;
    if (filter.tax_year) p.tax_year = filter.tax_year;
    if (filter.doc_type) p.doc_type = filter.doc_type;
    const [docData, clientData] = await Promise.all([getTaxDocs(p), getTaxDocClients()]);
    if (docData?.docs) setDocs(docData.docs);
    if (docData?.summary) setSummary(docData.summary);
    if (clientData?.clients) setClients(clientData.clients);
    if (docData?.error) setError(docData.error);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [filter, canView]);

  // Persist the view choice in the URL
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (view !== 'docs') next.set('view', view); else next.delete('view');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Refresh selected doc when docs update
  useEffect(() => {
    if (selectedDoc) {
      const updated = docs.find((d) => d.id === selectedDoc.id);
      if (updated) setSelectedDoc(updated);
    }
  }, [docs, selectedDoc]);

  if (!canView) return <AccessDenied permission="taxdocs.view" />;

  async function doAction(id, fn, ...args) {
    setPendingId(id);
    const resp = await fn(id, ...args);
    setPendingId(null);
    if (resp?.error) { setError(resp.error); return; }
    await refresh();
  }

  const statusCounts = {};
  ['uploaded','processing','review','approved','awaiting_signature','signed','filed','rejected'].forEach((s) => {
    statusCounts[s] = docs.filter((d) => d.status === s).length;
  });

  return (
    <div className="page">
      {/* Header + Stats */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>Tax Document Workflow</div>
            <div className="card-sub" style={{ marginTop: 2 }}>
              Process tax documents from upload through AI extraction, review, e-signature, and filing.
            </div>
          </div>
          {can('taxdocs.upload') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>⤴ Bulk upload</button>
              <button className="btn btn-gold" onClick={() => setShowUpload(true)}>+ Upload Document</button>
            </div>
          )}
        </div>

        {/* View toggle: docs (workflow list) vs clients (grouped + complexity) */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-elev-2)', borderRadius: 10, width: 'fit-content', marginBottom: 14 }}>
          <button
            onClick={() => setView('docs')}
            style={toggleBtn(view === 'docs')}
          >▤ Document workflow</button>
          <button
            onClick={() => setView('clients')}
            style={toggleBtn(view === 'clients')}
          >◈ By client · complexity & routing</button>
        </div>

        {/* Pipeline summary bar */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {WORKFLOW_STEPS.map((step) => (
            <button
              key={step.key}
              onClick={() => setFilter((f) => ({ ...f, status: f.status === step.key ? '' : step.key }))}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid',
                borderColor: filter.status === step.key ? STATUS_META[step.key]?.color : 'var(--border)',
                background: filter.status === step.key ? `${STATUS_META[step.key]?.color}18` : 'transparent',
                color: filter.status === step.key ? STATUS_META[step.key]?.color : 'var(--text-muted)',
                cursor: 'pointer', fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center'
              }}
            >
              {step.label}
              {statusCounts[step.key] > 0 && (
                <span style={{
                  background: STATUS_META[step.key]?.color, color: '#fff',
                  borderRadius: 10, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 700
                }}>{statusCounts[step.key]}</span>
              )}
            </button>
          ))}
          {filter.status === 'rejected' || (
            <button
              onClick={() => setFilter((f) => ({ ...f, status: f.status === 'rejected' ? '' : 'rejected' }))}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid',
                borderColor: filter.status === 'rejected' ? 'var(--error)' : 'var(--border)',
                background: filter.status === 'rejected' ? 'rgba(248,113,113,0.1)' : 'transparent',
                color: filter.status === 'rejected' ? 'var(--error)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center'
              }}
            >
              Rejected
              {statusCounts.rejected > 0 && (
                <span style={{ background: 'var(--error)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 700 }}>
                  {statusCounts.rejected}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Secondary filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: '0.84rem' }}
            value={filter.tax_year} onChange={(e) => setFilter((f) => ({ ...f, tax_year: e.target.value }))}>
            <option value="">All years</option>
            {TAX_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: '0.84rem' }}
            value={filter.doc_type} onChange={(e) => setFilter((f) => ({ ...f, doc_type: e.target.value }))}>
            <option value="">All doc types</option>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {(filter.status || filter.tax_year || filter.doc_type) && (
            <button className="btn btn-ghost" style={{ fontSize: '0.82rem' }}
              onClick={() => setFilter({ status: '', tax_year: '', doc_type: '' })}>
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginBottom: 14 }}>
          {error}
          <button className="btn btn-ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); refresh(); }}
        />
      )}

      {/* Document detail panel */}
      {selectedDoc && (
        <DocDetailPanel
          doc={selectedDoc}
          can={can}
          pending={pendingId === selectedDoc.id}
          onClose={() => setSelectedDoc(null)}
          onAction={doAction}
          onRefresh={refresh}
        />
      )}

      {/* Document workflow view */}
      {view === 'docs' && (
        <>
          {loading && <div className="card"><div className="empty">Loading…</div></div>}
          {!loading && docs.length === 0 && (
            <div className="card"><div className="empty">No documents match your filters.</div></div>
          )}
          {!loading && docs.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              can={can}
              pending={pendingId === doc.id}
              selected={selectedDoc?.id === doc.id}
              onSelect={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
              onAction={doAction}
            />
          ))}
        </>
      )}

      {/* By-client view with complexity scoring + routing suggestions */}
      {view === 'clients' && (
        <ClientView
          clients={clients}
          loading={loading}
          can={can}
          onOpenLink={(client) => setLinkModalClient(client)}
        />
      )}

      {/* Bulk upload modal */}
      {showBulk && (
        <BulkUploadModal
          onClose={() => setShowBulk(false)}
          onUploaded={() => { setShowBulk(false); refresh(); }}
        />
      )}

      {/* Send secure upload link modal */}
      {linkModalClient && (
        <UploadLinkModal
          client={linkModalClient}
          onClose={() => setLinkModalClient(null)}
        />
      )}
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, can, pending, selected, onSelect, onAction }) {
  const meta = STATUS_META[doc.status] || STATUS_META.uploaded;

  return (
    <div
      className="card"
      style={{
        marginBottom: 8, cursor: 'pointer',
        borderColor: selected ? 'var(--gold)' : `${meta.color}44`,
        background: selected ? 'var(--bg-elev-2)' : undefined
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 4, alignSelf: 'stretch', background: meta.color, borderRadius: 4, flex: 'none', minHeight: 44 }} />

        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55`,
              borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em'
            }}>{meta.label}</span>
            <span className="badge badge-muted">{doc.doc_type}</span>
            <span className="badge badge-muted">{doc.tax_year}</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{doc.filename}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 2 }}>
            <strong style={{ color: 'var(--gold-soft)' }}>{doc.client_name}</strong>
            {doc.client_email && <> · {doc.client_email}</>}
            <> · Uploaded {timeAgo(doc.uploaded_at)} by {doc.uploaded_by_name}</>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {doc.status === 'uploaded' || doc.status === 'processing' ? (
            can('taxdocs.review') && (
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }}
                disabled={pending}
                onClick={() => onAction(doc.id, processTaxDoc)}>
                {pending ? '…' : '⚡ Process'}
              </button>
            )
          ) : null}
          {doc.status === 'review' && can('taxdocs.approve') && (
            <>
              <button className="btn btn-gold" style={{ fontSize: '0.8rem' }}
                disabled={pending}
                onClick={() => onAction(doc.id, approveTaxDoc)}>
                {pending ? '…' : '✓ Approve'}
              </button>
            </>
          )}
          {doc.status === 'approved' && can('taxdocs.approve') && (
            <button className="btn btn-gold" style={{ fontSize: '0.8rem' }}
              disabled={pending}
              onClick={() => onAction(doc.id, sendTaxDocForSignature)}>
              {pending ? '…' : '✍ Send for Signature'}
            </button>
          )}
          {doc.status === 'awaiting_signature' && can('taxdocs.approve') && (
            <button className="btn btn-gold" style={{ fontSize: '0.8rem' }}
              disabled={pending}
              onClick={() => onAction(doc.id, recordTaxDocSigned)}>
              {pending ? '…' : '✓ Mark Signed'}
            </button>
          )}
          {doc.status === 'signed' && can('taxdocs.approve') && (
            <button className="btn btn-gold" style={{ fontSize: '0.8rem' }}
              disabled={pending}
              onClick={() => onAction(doc.id, markTaxDocFiled)}>
              {pending ? '…' : '◆ Mark Filed'}
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={onSelect}>
            {selected ? 'Close ↑' : 'Details →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document detail panel ─────────────────────────────────────────────────────

function DocDetailPanel({ doc, can, pending, onClose, onAction, onRefresh }) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const meta = STATUS_META[doc.status] || STATUS_META.uploaded;
  const currentStep = WORKFLOW_STEPS.findIndex((s) => s.key === doc.status);

  async function handleNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    const resp = await addTaxDocNote(doc.id, noteText.trim());
    setAddingNote(false);
    if (resp?.error) return alert(resp.error);
    setNoteText('');
    onRefresh();
  }

  return (
    <div className="card" style={{ marginBottom: 14, borderColor: `${meta.color}66` }}>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{doc.filename}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 2 }}>
            {doc.doc_type} · {doc.tax_year} · <strong style={{ color: 'var(--gold-soft)' }}>{doc.client_name}</strong>
            {doc.client_email && <> · {doc.client_email}</>}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>✕ Close</button>
      </div>

      {/* Workflow progress */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, overflowX: 'auto' }}>
        {WORKFLOW_STEPS.map((step, i) => {
          const stepMeta = STATUS_META[step.key];
          const isCurrent = doc.status === step.key;
          const isPast = currentStep > i && doc.status !== 'rejected';
          return (
            <React.Fragment key={step.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 700,
                  background: isPast ? 'var(--success)' : isCurrent ? stepMeta?.color || 'var(--gold)' : 'var(--bg-elev-2)',
                  color: isPast || isCurrent ? '#fff' : 'var(--text-dim)',
                  border: `2px solid ${isPast ? 'var(--success)' : isCurrent ? stepMeta?.color || 'var(--gold)' : 'var(--border)'}`
                }}>
                  {isPast ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: '0.68rem', color: isCurrent ? stepMeta?.color : 'var(--text-dim)', marginTop: 4, textAlign: 'center', fontWeight: isCurrent ? 700 : 400 }}>
                  {step.label}
                </div>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, alignSelf: 'flex-start', marginTop: 13, background: isPast ? 'var(--success)' : 'var(--border)' }} />
              )}
            </React.Fragment>
          );
        })}
        {doc.status === 'rejected' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, background: 'var(--error)', color: '#fff', border: '2px solid var(--error)' }}>✕</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--error)', marginTop: 4, fontWeight: 700 }}>Rejected</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {/* Extracted data */}
        {doc.extracted_data && (
          <div style={{ background: 'var(--bg-elev-2)', borderRadius: 10, padding: 14 }}>
            <div style={{ color: 'var(--gold-soft)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Extracted Data</div>
            {Object.entries(doc.extracted_data).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4, gap: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k.replace(/_/g, ' ')}</span>
                <span style={{ fontWeight: 600 }}>{typeof v === 'number' && k.includes('tax') || k.includes('wage') || k.includes('income') || k.includes('profit') || k.includes('receipt') || k.includes('compensation') || k.includes('amount') ? `$${v.toLocaleString()}` : String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI Summary */}
        {doc.ai_summary && (
          <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, padding: 14 }}>
            <div style={{ color: 'var(--info)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Milton's Analysis</div>
            <div style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>{doc.ai_summary}</div>
          </div>
        )}

        {/* Rejection info */}
        {doc.status === 'rejected' && doc.rejection_reason && (
          <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: 14 }}>
            <div style={{ color: 'var(--error)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Rejection Reason</div>
            <div style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>{doc.rejection_reason}</div>
          </div>
        )}

        {/* E-signature status */}
        {doc.esign_url && (
          <div style={{ background: 'var(--bg-elev-2)', borderRadius: 10, padding: 14 }}>
            <div style={{ color: 'var(--gold-soft)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>E-Signature</div>
            {doc.esign_sent_at && <div style={{ fontSize: '0.84rem', marginBottom: 6 }}>Sent {timeAgo(doc.esign_sent_at)}</div>}
            {doc.signed_at
              ? <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.88rem' }}>✓ Signed {timeAgo(doc.signed_at)}</div>
              : <div style={{ fontSize: '0.84rem', color: 'var(--warning)' }}>Awaiting client signature</div>
            }
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-dim)', wordBreak: 'break-all' }}>
              Link: <span style={{ color: 'var(--gold-soft)' }}>{doc.esign_url}</span>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div style={{ background: 'var(--bg-elev-2)', borderRadius: 10, padding: 14 }}>
          <div style={{ color: 'var(--gold-soft)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Timeline</div>
          {[
            { label: 'Uploaded', at: doc.uploaded_at, by: doc.uploaded_by_name },
            { label: 'Processed', at: doc.processing_completed_at },
            { label: 'Reviewed', at: doc.reviewed_at, by: doc.reviewed_by_name },
            { label: 'Approved', at: doc.approved_at, by: doc.approved_by_name },
            { label: 'E-sign sent', at: doc.esign_sent_at },
            { label: 'Signed', at: doc.signed_at },
            { label: 'Filed', at: doc.filed_at },
            { label: 'Rejected', at: doc.rejected_at }
          ].filter((e) => e.at).map((e) => (
            <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: 4, gap: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>{e.label}{e.by ? ` by ${e.by}` : ''}</span>
              <span>{timeAgo(e.at)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      {doc.notes && (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-elev-2)', borderRadius: 8, fontSize: '0.86rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
          {doc.notes}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {(doc.status === 'uploaded' || doc.status === 'processing') && can('taxdocs.review') && (
          <button className="btn btn-gold" disabled={pending} onClick={() => onAction(doc.id, processTaxDoc)}>
            {pending ? '…' : '⚡ Run AI Extraction'}
          </button>
        )}
        {doc.status === 'review' && can('taxdocs.approve') && (
          <>
            <button className="btn btn-gold" disabled={pending} onClick={() => onAction(doc.id, approveTaxDoc)}>
              {pending ? '…' : '✓ Approve Document'}
            </button>
            <button className="btn btn-ghost" style={{ color: 'var(--error)' }} onClick={() => setShowReject(true)}>
              ✕ Reject
            </button>
          </>
        )}
        {doc.status === 'approved' && can('taxdocs.approve') && (
          <button className="btn btn-gold" disabled={pending} onClick={() => onAction(doc.id, sendTaxDocForSignature)}>
            {pending ? '…' : '✍ Send E-Signature Request'}
          </button>
        )}
        {doc.status === 'awaiting_signature' && can('taxdocs.approve') && (
          <button className="btn btn-gold" disabled={pending} onClick={() => onAction(doc.id, recordTaxDocSigned)}>
            {pending ? '…' : '✓ Mark as Signed'}
          </button>
        )}
        {doc.status === 'signed' && can('taxdocs.approve') && (
          <button className="btn btn-gold" disabled={pending} onClick={() => onAction(doc.id, markTaxDocFiled)}>
            {pending ? '…' : '◆ Mark as Filed'}
          </button>
        )}
        {doc.status === 'rejected' && can('taxdocs.approve') && (
          <button className="btn btn-gold" disabled={pending} onClick={() => onAction(doc.id, approveTaxDoc)}>
            {pending ? '…' : '↺ Re-Approve (override rejection)'}
          </button>
        )}

        {/* Add note inline */}
        {can('taxdocs.review') && (
          <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 280 }}>
            <input className="input" style={{ flex: 1, padding: '8px 12px' }}
              placeholder="Add a note…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNote()}
            />
            <button className="btn btn-ghost" disabled={addingNote || !noteText.trim()} onClick={handleNote}>
              {addingNote ? '…' : 'Add note'}
            </button>
          </div>
        )}
      </div>

      {/* Reject form */}
      {showReject && (
        <div style={{ marginTop: 14, padding: 14, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8 }}>
          <div style={{ color: 'var(--error)', fontWeight: 600, marginBottom: 8 }}>Reject Document</div>
          <textarea className="input" rows={3} style={{ marginBottom: 8 }}
            placeholder="Reason for rejection (will be logged and shown to staff)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setShowReject(false); setRejectReason(''); }}>Cancel</button>
            <button className="btn btn-ghost" style={{ color: 'var(--error)' }}
              disabled={!rejectReason.trim() || pending}
              onClick={() => { onAction(doc.id, rejectTaxDoc, rejectReason); setShowReject(false); setRejectReason(''); }}>
              Confirm Rejection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onUploaded }) {
  const [form, setForm] = useState({ client_name: '', client_email: '', client_phone: '', doc_type: 'W-2', tax_year: '2024', filename: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.client_name.trim()) { setError('Client name is required.'); return; }
    if (!form.filename.trim()) { setError('Filename is required.'); return; }
    setSaving(true);
    const resp = await uploadTaxDoc({ ...form, file_size: 0 });
    setSaving(false);
    if (resp?.error) { setError(resp.error); return; }
    onUploaded();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Upload Tax Document</div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ color: 'var(--error)', marginBottom: 12, fontSize: '0.86rem' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Client Name *">
            <input className="input" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="Marcus Johnson" />
          </Field>
          <Field label="Client Email">
            <input className="input" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} placeholder="client@example.com" />
          </Field>
          <Field label="Client Phone">
            <input className="input" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} placeholder="+12025550101" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Document Type">
              <select className="input" value={form.doc_type} onChange={(e) => set('doc_type', e.target.value)}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Tax Year">
              <select className="input" value={form.tax_year} onChange={(e) => set('tax_year', e.target.value)}>
                {TAX_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Filename *">
            <input className="input" value={form.filename} onChange={(e) => set('filename', e.target.value)} placeholder="Marcus_Johnson_W2_2024.pdf" />
          </Field>
          <Field label="Notes">
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Any context about this document…" />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={submit} disabled={saving}>
            {saving ? 'Uploading…' : 'Upload Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toggleBtn(active) {
  return {
    padding: '6px 14px', fontSize: '0.84rem', fontWeight: 600, borderRadius: 8,
    border: 'none', cursor: 'pointer',
    background: active ? 'var(--bg-surface)' : 'transparent',
    color: active ? 'var(--olive)' : 'var(--text-muted)',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.15s ease'
  };
}

const TIER_BADGE = {
  simple:   { bg: 'rgba(74,124,44,0.10)',  fg: 'var(--success)',     border: 'rgba(74,124,44,0.40)',  label: 'Simple' },
  moderate: { bg: 'rgba(199,126,32,0.10)', fg: 'var(--warning)',     border: 'rgba(199,126,32,0.45)', label: 'Moderate' },
  complex:  { bg: 'rgba(184,98,58,0.10)',  fg: 'var(--terracotta)',  border: 'rgba(184,98,58,0.45)',  label: 'Complex' }
};

function ComplexityBadge({ tier, score }) {
  const c = TIER_BADGE[tier] || TIER_BADGE.simple;
  return (
    <span style={{
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap'
    }}>
      {c.label} · {score}
    </span>
  );
}

// ─── Client-grouped view with complexity + routing suggestion ────────────────

function ClientView({ clients, loading, can, onOpenLink }) {
  if (loading) return <div className="card"><div className="empty">Loading…</div></div>;
  if (!clients?.length) return <div className="card"><div className="empty">No clients with documents yet.</div></div>;

  return (
    <>
      {clients.map((c) => (
        <ClientCard key={c.client_id || c.client_name} client={c} can={can} onOpenLink={onOpenLink} />
      ))}
    </>
  );
}

function ClientCard({ client, can, onOpenLink }) {
  const cx = client.complexity;
  const sa = client.suggested_assignee;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <strong style={{ fontSize: '1.05rem' }}>{client.client_name}</strong>
            <ComplexityBadge tier={cx.tier} score={cx.score} />
            {cx.rejected_count > 0 && (
              <span style={{ background: 'rgba(184,58,38,0.10)', color: 'var(--error)', border: '1px solid rgba(184,58,38,0.4)', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 }}>
                {cx.rejected_count} rejected
              </span>
            )}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 8 }}>
            {cx.doc_count} document{cx.doc_count === 1 ? '' : 's'} · {cx.doc_types.join(', ')}
            {cx.years?.length > 1 && <> · years {cx.years.join('/')}</>}
          </div>

          {/* Pipeline status mix */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {Object.entries(client.status_counts).filter(([, n]) => n > 0).map(([s, n]) => (
              <span key={s} className="badge badge-muted" style={{ fontSize: '0.72rem' }}>
                {s.replace(/_/g, ' ')}: <strong>{n}</strong>
              </span>
            ))}
          </div>

          {/* Suggested assignee */}
          {sa && (
            <div style={{
              padding: 10, background: 'var(--bg-elev-2)', borderRadius: 8,
              fontSize: '0.84rem', lineHeight: 1.5
            }}>
              <div style={{ color: 'var(--olive)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 2 }}>
                Suggested assignee
              </div>
              <div>
                <strong>{sa.name}</strong> <span style={{ color: 'var(--text-muted)' }}>· {sa.title || sa.role}</span>
                <span style={{ marginLeft: 8, color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                  ({sa.current_workload} open assignment{sa.current_workload === 1 ? '' : 's'})
                </span>
              </div>
              {sa.alternatives?.length > 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem', marginTop: 2 }}>
                  Alternates: {sa.alternatives.map((a) => `${a.name} (${a.current_workload})`).join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
          {can('taxdocs.upload') && (
            <button className="btn btn-ghost" onClick={() => onOpenLink(client)} style={{ fontSize: '0.82rem' }}>
              🔒 Send secure upload link
            </button>
          )}
          <Link
            to={`/dashboard/taxdocs?client_id=${client.client_id || ''}`}
            className="btn btn-gold"
            style={{ fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}
          >
            View {cx.doc_count} doc{cx.doc_count === 1 ? '' : 's'} →
          </Link>
        </div>
      </div>

      {/* Why-complex breakdown */}
      {cx.reasons?.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Why this complexity score
          </summary>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {cx.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Bulk upload modal — drag-drop many files with auto-classification ──────

function BulkUploadModal({ onClose, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  function classify(filename) {
    const f = String(filename).toLowerCase();
    let doc_type = 'other';
    if (/\bw[-_ ]?2\b/.test(f))                          doc_type = 'W-2';
    else if (/1099[-_ ]?nec/.test(f))                    doc_type = '1099-NEC';
    else if (/1099[-_ ]?k\b/.test(f))                    doc_type = '1099-K';
    else if (/1099[-_ ]?misc/.test(f))                   doc_type = '1099-MISC';
    else if (/\b1099\b/.test(f))                         doc_type = '1099-MISC';
    else if (/\bk[-_ ]?1\b|\bk1\b/.test(f))              doc_type = 'K-1';
    else if (/schedule[-_ ]?c|sch[-_ ]?c\b/.test(f))     doc_type = 'Schedule-C';
    else if (/\b1040\b/.test(f))                         doc_type = '1040';
    const yr = f.match(/20(2[0-9]|1[0-9])/);
    const tax_year = yr ? Number(yr[0]) : new Date().getFullYear() - 1;
    return { doc_type, tax_year };
  }

  function addFiles(list) {
    const next = [...files];
    for (const f of list) {
      const cls = classify(f.name);
      next.push({ filename: f.name, size: f.size, ...cls });
    }
    setFiles(next);
  }

  function update(i, patch) {
    setFiles(files.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function remove(i) { setFiles(files.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!clientName.trim()) { setError('Client name is required.'); return; }
    if (!files.length) { setError('Drop at least one file.'); return; }
    setSaving(true);
    const resp = await bulkUploadTaxDocs({
      client_name: clientName.trim(),
      client_email: clientEmail.trim() || undefined,
      files
    });
    setSaving(false);
    if (resp?.error) { setError(resp.error); return; }
    onUploaded();
  }

  return (
    <div style={modalBg}>
      <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Bulk upload documents</div>
            <div className="card-sub">Drop multiple files at once. We'll auto-detect the type and tax year from the filename — review and adjust before saving.</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Field label="Client name *">
            <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Marcus Johnson" />
          </Field>
          <Field label="Client email">
            <input className="input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
          </Field>
        </div>

        <div
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--olive)' : 'var(--border-strong)'}`,
            borderRadius: 10, padding: 22, textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'rgba(92,110,45,0.06)' : 'transparent',
            marginBottom: 12
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>⤴</div>
          <div style={{ fontWeight: 600 }}>Drop files here or click to browse</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>Filenames like “W2_2024.pdf” auto-detect as W-2 for 2024</div>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
        </div>

        {files.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr><th>Filename</th><th style={{ width: 130 }}>Doc type</th><th style={{ width: 90 }}>Year</th><th style={{ width: 40 }}></th></tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '0.84rem' }}>{f.filename}</td>
                    <td>
                      <select className="input" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              value={f.doc_type} onChange={(e) => update(i, { doc_type: e.target.value })}>
                        {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="input" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              value={f.tax_year} onChange={(e) => update(i, { tax_year: Number(e.target.value) })}>
                        {TAX_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </td>
                    <td><button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => remove(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <div style={{ color: 'var(--error)', fontSize: '0.84rem', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={submit} disabled={saving || !files.length}>
            {saving ? 'Uploading…' : `Upload ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send secure upload link modal ──────────────────────────────────────────

function UploadLinkModal({ client, onClose }) {
  const [message, setMessage] = useState('Please upload your tax documents (W-2s, 1099s, K-1s, prior-year returns, receipts). The link is unique to you and secure.');
  const [days, setDays] = useState(14);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setSaving(true); setError(null);
    const resp = await createUploadLink({
      client_id: client.client_id,
      client_name: client.client_name,
      client_email: client.client_email,
      client_phone: client.client_phone,
      message,
      expires_in_days: Number(days) || 14
    });
    setSaving(false);
    if (resp?.error) { setError(resp.error); return; }
    setResult(resp);
  }

  function copy() {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={modalBg}>
      <div className="card" style={{ width: '100%', maxWidth: 560 }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Send secure upload link</div>
            <div className="card-sub">For {client.client_name}{client.client_email ? ` · ${client.client_email}` : ''}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        {!result ? (
          <>
            <Field label="Message shown to the client">
              <textarea className="input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <Field label="Link valid for (days)">
              <input className="input" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            {error && <div style={{ color: 'var(--error)', fontSize: '0.84rem', marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-gold" disabled={saving} onClick={generate}>
                {saving ? 'Generating…' : 'Generate link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: 12, background: 'var(--bg-elev-2)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ color: 'var(--olive)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
                Secure link
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, wordBreak: 'break-all', fontSize: '0.82rem', color: 'var(--olive)' }}>{result.url}</code>
                <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={copy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 8 }}>
                Expires {new Date(result.link.expires_at).toLocaleDateString()} · used {result.link.used_count} time{result.link.used_count === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Send this link to {client.client_name} by email or text. They can drop tax documents without logging in, and uploads appear in the workflow tagged as client portal uploads.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-gold" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const modalBg = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
};
