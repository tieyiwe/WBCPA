import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api.js';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    localStorage.setItem('wbcpa_token', result.token);
    localStorage.setItem('wbcpa_user', JSON.stringify(result.user));
    navigate('/dashboard');
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>WBCPA Command Center</h1>
        <div className="tag">Staff dashboard · Built by TIblogics</div>

        <div className="form-group">
          <label>Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@wbcpa.com"
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button className="btn btn-gold" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? <><span className="spinner" />Signing in…</> : 'Sign in'}
        </button>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Preview mode: any email & password will sign in until Supabase Auth is connected.
        </div>
      </form>
    </div>
  );
}
