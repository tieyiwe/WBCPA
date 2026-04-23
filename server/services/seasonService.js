// ─────────────────────────────────────────────────────────────────────────────
// Season Service — detect current tax season and supply the corresponding
// tone primer that is injected into the Bland AI system prompt.
// ─────────────────────────────────────────────────────────────────────────────

const { supabase, isConfigured } = require('./db');
const { MOCK_CONFIG } = require('./mockData');

const SEASONS = {
  PEAK_SEASON: {
    key: 'PEAK_SEASON',
    months: [1, 2, 3, 4],
    label: 'Peak Season',
    color: '#f97316'
  },
  EXTENSION: {
    key: 'EXTENSION',
    months: [5, 6, 7, 8, 9],
    label: 'Extension',
    color: '#3b82f6'
  },
  PRE_FILING: {
    key: 'PRE_FILING',
    months: [10, 11, 12],
    label: 'Pre-Filing',
    color: '#c9a84c'
  }
};

function detectSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  for (const key of Object.keys(SEASONS)) {
    if (SEASONS[key].months.includes(month)) return key;
  }
  return 'PRE_FILING';
}

async function updateSeason(seasonKey) {
  if (!SEASONS[seasonKey]) throw new Error(`Unknown season: ${seasonKey}`);

  if (!isConfigured()) {
    MOCK_CONFIG.current_season = seasonKey;
    return { ok: true, mock: true, season: seasonKey };
  }

  try {
    const { error } = await supabase
      .from('system_config')
      .upsert({ key: 'current_season', value: seasonKey, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true, season: seasonKey };
  } catch (err) {
    console.warn('[Season] updateSeason failed, mock fallback:', err.message);
    MOCK_CONFIG.current_season = seasonKey;
    return { ok: true, mock: true, season: seasonKey };
  }
}

async function getCurrentSeason() {
  if (!isConfigured()) return MOCK_CONFIG.current_season || detectSeason();

  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'current_season')
      .maybeSingle();
    if (error) throw error;
    return data?.value || detectSeason();
  } catch (err) {
    console.warn('[Season] getCurrentSeason failed, using detectSeason:', err.message);
    return detectSeason();
  }
}

function getSeasonPromptTone(season) {
  switch (season) {
    case 'PEAK_SEASON':
      return [
        'CURRENT TAX SEASON CONTEXT: It is now PEAK SEASON (February–April 15).',
        'Be urgent and action-oriented. Reference the April 15 deadline.',
        'Phrases to use: "we still have time", "act before April 15", "deadline is approaching".'
      ].join('\n');

    case 'EXTENSION':
      return [
        'CURRENT TAX SEASON CONTEXT: It is EXTENSION SEASON (April 16–October 15).',
        'Be structured and compliance-focused. Reference October 15 extended deadline.',
        'Remind that tax payment was still due April 15 even with extension.'
      ].join('\n');

    case 'PRE_FILING':
    default:
      return [
        'CURRENT TAX SEASON CONTEXT: It is PRE-FILING SEASON (October–January).',
        'Be proactive and planning-focused. Encourage early document gathering.',
        'Phrases to use: "get ahead of tax season", "plan now to save more", "before year-end".'
      ].join('\n');
  }
}

module.exports = {
  SEASONS,
  detectSeason,
  updateSeason,
  getCurrentSeason,
  getSeasonPromptTone
};
