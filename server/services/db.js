// ─────────────────────────────────────────────────────────────────────────────
// Supabase Client Wrapper
// If SUPABASE_URL / SUPABASE_SERVICE_KEY are missing, `isConfigured` is false
// and every caller falls back to mock data via server/services/mockData.js.
// ─────────────────────────────────────────────────────────────────────────────
//
// Full SQL schema is maintained in /database_schema.sql — paste that file
// into the Supabase SQL editor and run it to provision all tables + indexes.
//
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const isConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

let supabase = null;
if (isConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } catch (err) {
    console.warn('[DB] Failed to init Supabase client — falling back to mock mode:', err.message);
    supabase = null;
  }
}

if (!isConfigured) {
  console.log('[DB] Supabase not configured — running in MOCK_MODE.');
}

module.exports = {
  supabase,
  isConfigured: () => Boolean(supabase)
};
