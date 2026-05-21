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

// ─── Client-grouped view + per-doc complexity ────────────────────────────────
router.get('/clients', (req, res) => {
  try {
    res.json({ clients: svc.listClients() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/clients/:clientId/complexity', (req, res) => {
  try {
    const complexity = svc.computeClientComplexity(req.params.clientId);
    const assignee = svc.suggestAssignee(complexity);
    res.json({ complexity, suggested_assignee: assignee });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id/complexity', (req, res) => {
  try {
    const doc = svc.getDoc(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const complexity = svc.computeDocComplexity(doc);
    const assignee = svc.suggestAssignee(doc);
    res.json({ complexity, suggested_assignee: assignee });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Per-doc assignment ──────────────────────────────────────────────────────
router.post('/:id/assign', requirePermission('taxdocs.approve'), (req, res) => {
  try {
    const doc = svc.assignDoc(req.params.id, req.body || {}, req.actor);
    res.json({ doc, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Bulk upload (drag-drop multiple files at once) ──────────────────────────
router.post('/bulk', requirePermission('taxdocs.upload'), (req, res) => {
  try {
    const { files, ...baseMeta } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required.' });
    }
    const docs = svc.bulkUpload(files, baseMeta, req.actor);
    res.json({ docs, count: docs.length, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Secure client upload tokens (staff endpoints) ──────────────────────────
router.post('/upload-link', requirePermission('taxdocs.upload'), (req, res) => {
  try {
    const link = svc.createUploadToken(req.body || {}, req.actor);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ link, url: `${baseUrl}/upload/${link.token}`, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/upload-links', requirePermission('taxdocs.upload'), (req, res) => {
  res.json({ links: svc.listUploadTokens() });
});

router.post('/upload-link/:token/revoke', requirePermission('taxdocs.upload'), (req, res) => {
  try {
    const link = svc.revokeUploadToken(req.params.token, req.actor);
    res.json({ link, ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
