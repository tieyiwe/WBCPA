// ─────────────────────────────────────────────────────────────────────────────
// Role context — demo role switcher. The selected role is persisted in
// localStorage and forwarded to every /api/* call via x-demo-role header (see
// api.js). When real auth is wired up, the current user's role replaces this.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ROLES, can as canCheck } from './permissions.js';

const STORAGE_KEY = 'wbcpa_demo_role';
const DEFAULT_ROLE = 'owner';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      return saved && ROLES[saved] ? saved : DEFAULT_ROLE;
    } catch {
      return DEFAULT_ROLE;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, role); } catch { /* ignore */ }
  }, [role]);

  const value = useMemo(() => ({
    role,
    setRole: setRoleState,
    roleDetail: ROLES[role],
    can: (key) => canCheck(role, key)
  }), [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}

export function getCurrentDemoRole() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && ROLES[saved] ? saved : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}
