// ─────────────────────────────────────────────────────────────────────────────
// Translation Service
// Detects the language of a call transcript and, if it's not English,
// translates every segment + the summary into English using Claude.
// No-ops gracefully when ANTHROPIC_API_KEY is absent.
// ─────────────────────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = process.env.MILTON_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.TRANSLATION_MODEL || 'claude-sonnet-4-6';
const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German',
  it: 'Italian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic',
  ru: 'Russian', hi: 'Hindi', vi: 'Vietnamese', tl: 'Tagalog', pl: 'Polish'
};

// Quick heuristic pre-check so we don't burn an API call on obviously-English text.
function looksEnglish(text) {
  if (!text) return true;
  const sample = text.slice(0, 600).toLowerCase();
  // Non-Latin scripts → definitely not English
  if (/[぀-ヿ一-鿿가-힯؀-ۿЀ-ӿ]/.test(sample)) return false;
  // Common English stopwords present?
  const stop = [' the ', ' and ', ' you ', ' is ', ' to ', ' for ', ' your ', ' i ', ' a ', ' of ', ' how ', ' can '];
  const hits = stop.filter((w) => sample.includes(w)).length;
  // Common Spanish/French markers
  const romance = [' el ', ' la ', ' los ', ' que ', ' para ', ' con ', ' usted ', ' gracias ', ' le ', ' les ', ' vous ', ' bonjour ', ' merci ', ' est ', ' une ', ' je ', ' votre '];
  const romanceHits = romance.filter((w) => sample.includes(w)).length;
  if (romanceHits >= 2 && romanceHits > hits) return false;
  return hits >= 2;
}

// Translate a structured transcript [{role, at, text}] + summary to English.
// Returns { was_translated, source_language, source_language_name, segments, summary }.
async function translateCall({ segments, summary }) {
  const joined = [
    summary || '',
    ...(segments || []).map((s) => s.text)
  ].join('\n');

  // Fast path: looks English, or nothing to translate, or no API key.
  if (!client || !joined.trim() || looksEnglish(joined)) {
    return { was_translated: false, source_language: 'en', source_language_name: 'English', segments, summary };
  }

  // Build a compact numbered list for the model to translate deterministically.
  const numbered = (segments || []).map((s, i) => `${i}\t${s.text}`).join('\n');

  const sys = `You are a professional interpreter for a CPA firm's call center. Detect the language of the transcript below and translate EVERYTHING into natural, professional English. Preserve meaning, tone, numbers, names, and tax terminology. Do not summarize or omit anything.

Return ONLY valid JSON, no prose, in exactly this shape:
{"source_language":"<ISO 639-1 code, e.g. es>","segments":["<english text for index 0>","<english text for index 1>", ...],"summary":"<english translation of the summary>"}

The "segments" array MUST have exactly the same number of items, in the same order, as the input lines (one per index).`;

  const user = `SUMMARY:\n${summary || '(none)'}\n\nTRANSCRIPT (index<TAB>text):\n${numbered}`;

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: sys,
      messages: [{ role: 'user', content: user }]
    });
    const raw = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    // Strip code fences if present
    const jsonStr = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    const lang = parsed.source_language || 'unknown';
    if (lang === 'en') {
      return { was_translated: false, source_language: 'en', source_language_name: 'English', segments, summary };
    }

    const translatedSegments = (segments || []).map((s, i) => ({
      role: s.role,
      at: s.at,
      text: parsed.segments?.[i] || s.text,   // english
      original_text: s.text                    // keep the source for "view original"
    }));

    return {
      was_translated: true,
      source_language: lang,
      source_language_name: LANGUAGE_NAMES[lang] || lang.toUpperCase(),
      segments: translatedSegments,
      summary: parsed.summary || summary
    };
  } catch (err) {
    console.warn('[Translation] failed, keeping original:', err.message);
    return { was_translated: false, source_language: 'unknown', source_language_name: 'Unknown', segments, summary };
  }
}

module.exports = { translateCall, looksEnglish };
