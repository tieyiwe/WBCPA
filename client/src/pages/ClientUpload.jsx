import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicUploadInfo, postPublicUpload } from '../lib/api.js';

// Public no-auth page at /upload/:token where clients drop tax docs.
// Staff issues the link via /api/taxdocs/upload-link.

export default function ClientUpload() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    getPublicUploadInfo(token).then((data) => {
      if (data?.error) setError(data.error);
      else setInfo(data);
    });
  }, [token]);

  function addFiles(list) {
    const next = [...files];
    for (const f of list) {
      next.push({ name: f.name, size: f.size, _raw: f });
    }
    setFiles(next);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  function removeAt(i) {
    setFiles(files.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!files.length) return;
    setSubmitting(true);
    setError(null);
    const payload = files.map((f) => ({ filename: f.name, size: f.size }));
    const resp = await postPublicUpload(token, payload);
    setSubmitting(false);
    if (resp?.error) { setError(resp.error); return; }
    setResult(resp);
    setFiles([]);
  }

  if (error && !info) {
    return (
      <div style={pageBg}>
        <div style={card}>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--olive)', marginBottom: 12 }}>Link unavailable</h1>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.86rem', marginTop: 16 }}>
            If you believe this is a mistake, contact WBCPA at 888-502-5672.
          </p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={pageBg}>
        <div style={card}><div style={{ color: 'var(--text-muted)' }}>Loading…</div></div>
      </div>
    );
  }

  if (result) {
    return (
      <div style={pageBg}>
        <div style={card}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✓</div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--olive)', marginBottom: 12 }}>Thanks, {info.client_name}.</h1>
          <p style={{ color: 'var(--text-muted)' }}>{result.message}</p>
          <button className="btn btn-gold" onClick={() => setResult(null)} style={{ marginTop: 18 }}>
            Upload more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageBg}>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ color: 'var(--olive)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>The Wealth Building CPA</div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--text)', marginTop: 6, marginBottom: 6 }}>Secure Document Upload</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>For {info.client_name}</div>
        </div>

        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 18 }}>
          {info.message}
        </p>

        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--olive)' : 'var(--border-strong)'}`,
            borderRadius: 14,
            padding: 32,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(92,110,45,0.06)' : 'var(--bg-elev-1)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>⤴</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop files here, or click to browse</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            We accept W-2s, 1099s, K-1s, prior-year returns, receipts, and any other tax document.
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {files.length} file{files.length === 1 ? '' : 's'} ready
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 8, background: 'var(--bg-elev-2)', border: '1px solid var(--border)'
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.88rem' }}>{f.name}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{(f.size / 1024).toFixed(0)} KB</span>
                  <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => removeAt(i)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.86rem', marginTop: 12, padding: 10, background: 'rgba(184,58,38,0.08)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-gold" disabled={!files.length || submitting} onClick={submit} style={{ padding: '10px 20px' }}>
            {submitting ? 'Uploading…' : `Submit ${files.length || ''} document${files.length === 1 ? '' : 's'}`}
          </button>
        </div>

        <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-elev-2)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--text-muted)' }}>🔒 Secure:</strong> This link is unique to you and expires on{' '}
          {new Date(info.expires_at).toLocaleDateString()}. Files are sent directly to your WBCPA team and are not shared.
        </div>
      </div>
    </div>
  );
}

const pageBg = {
  minHeight: '100vh',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  position: 'relative',
  zIndex: 3
};

const card = {
  width: '100%',
  maxWidth: 600,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 32,
  boxShadow: 'var(--shadow-md)'
};
