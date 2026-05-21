import React from 'react';

// Wraps children in a React error boundary so a crash in any single component
// (bad hooks, undefined access, etc.) doesn't blank the entire app. The
// fallback panel surfaces the error so it's actually debuggable.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        margin: 24, padding: 20, borderRadius: 12,
        background: 'var(--bg-elev-1)', border: '1px solid var(--error)',
        color: 'var(--text)', maxWidth: 800
      }}>
        <div style={{ color: 'var(--error)', fontWeight: 700, fontSize: '1.05rem', marginBottom: 8 }}>
          ⚠ Something broke in this view
        </div>
        <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          The rest of the app is still running. Try reloading the page, or use the sidebar to navigate elsewhere.
          If this keeps happening, copy the error below and share it.
        </div>
        <pre style={{
          background: 'var(--bg-elev-2)', padding: 12, borderRadius: 8,
          fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
          overflowX: 'auto', color: 'var(--text)', margin: 0,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
{String(this.state.error?.stack || this.state.error?.message || this.state.error)}
        </pre>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn btn-gold" onClick={() => window.location.reload()}>Reload page</button>
          <button className="btn btn-ghost" onClick={this.reset}>Try again</button>
        </div>
      </div>
    );
  }
}
