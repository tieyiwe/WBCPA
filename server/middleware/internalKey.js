// ─────────────────────────────────────────────────────────────────────────────
// Internal API key guard — used on endpoints hit directly by Bland AI tools.
// Expected header: x-api-key: <INTERNAL_API_KEY>
// In MOCK_MODE (no INTERNAL_API_KEY set), we accept any request so testing the
// agent flow locally works without configuration.
// ─────────────────────────────────────────────────────────────────────────────

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function guardInternal(req, res, next) {
  if (!INTERNAL_API_KEY) return next();
  const provided = req.headers['x-api-key'] || req.headers['X-API-Key'];
  if (provided !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Invalid internal API key.' });
  }
  return next();
}

module.exports = { guardInternal };
