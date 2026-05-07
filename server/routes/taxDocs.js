// ─────────────────────────────────────────────────────────────────────────────
// Tax Document Workflow — REST API
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { attachActor, requirePermission } = require('../middleware/currentActor');
const svc = require('../services/taxDocService');

router.use(attachActor);

// GET /api/taxdocs?client_id=&status=&tax_year=&doc_type=
router.get('/', (req, res) => {
  try {
    const docs = svc.listDocs(req.query);
    const sum = svc.summary();
    res.json({ docs, summary: sum });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/taxdocs/summary
router.get('/summary', (req, res) => {
  res.json({ summary: svc.summary() });
});

// GET /api/taxdocs/:id
router.get('/:id', (req, res) => {
  const doc = svc.getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.json({ doc });
});

// POST /api/taxdocs — upload a new document
router.post('/', requirePermission('taxdocs.upload'), (req, res) => {
  try {
    const doc = svc.uploadDoc(req.body, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/process — trigger AI extraction (or simulate it)
router.post('/:id/process', requirePermission('taxdocs.review'), (req, res) => {
  try {
    const doc = svc.simulateAiExtraction(req.params.id, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/approve
router.post('/:id/approve', requirePermission('taxdocs.approve'), (req, res) => {
  try {
    const doc = svc.approveDoc(req.params.id, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/reject
router.post('/:id/reject', requirePermission('taxdocs.approve'), (req, res) => {
  try {
    const doc = svc.rejectDoc(req.params.id, req.body, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/send-for-signature
router.post('/:id/send-for-signature', requirePermission('taxdocs.approve'), async (req, res) => {
  try {
    const result = await svc.sendForSignature(req.params.id, req.actor);
    res.json({ ...result, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/record-signed — staff marks client has signed
router.post('/:id/record-signed', requirePermission('taxdocs.approve'), (req, res) => {
  try {
    const doc = svc.recordSigned(req.params.id, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/mark-filed
router.post('/:id/mark-filed', requirePermission('taxdocs.approve'), (req, res) => {
  try {
    const doc = svc.markFiled(req.params.id, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/taxdocs/:id/note
router.post('/:id/note', requirePermission('taxdocs.review'), (req, res) => {
  try {
    const doc = svc.addNote(req.params.id, req.body, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
