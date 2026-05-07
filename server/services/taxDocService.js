// ─────────────────────────────────────────────────────────────────────────────
// Tax Document Workflow Service
// Manages the full lifecycle: upload → review → approve → e-sign → filed
// Runs entirely on mock data when no Supabase is configured.
// ─────────────────────────────────────────────────────────────────────────────

const { logActivity } = require('./adminService');

const nowIso = () => new Date().toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const daysAhead = (d) => new Date(Date.now() + d * 86400000).toISOString();

// Statuses in workflow order
const STATUS_ORDER = ['uploaded', 'processing', 'review', 'approved', 'awaiting_signature', 'signed', 'filed', 'rejected'];

// ── Mock document store ───────────────────────────────────────────────────────

const MOCK_TAX_DOCS = [
  {
    id: 'tdoc_001',
    client_id: 'sub_001',
    client_name: 'Marcus Johnson',
    client_email: 'marcus.johnson@example.com',
    client_phone: '+12025550101',
    doc_type: 'W-2',
    tax_year: 2024,
    filename: 'Marcus_Johnson_W2_2024.pdf',
    file_size: 245000,
    status: 'review',
    uploaded_by_id: 'mbr_001',
    uploaded_by_name: 'Devon Williams',
    uploaded_at: daysAgo(3),
    processing_completed_at: daysAgo(3),
    reviewed_by_id: null,
    reviewed_by_name: null,
    reviewed_at: null,
    approved_by_id: null,
    approved_by_name: null,
    approved_at: null,
    esign_token: null,
    esign_sent_at: null,
    esign_url: null,
    signed_at: null,
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: 'Property management income from 12 rental units',
    extracted_data: {
      employer: 'Johnson Properties LLC',
      ein: '12-3456789',
      wages: 94000,
      federal_tax_withheld: 18200,
      state_tax_withheld: 5640,
      state: 'MD',
      social_security_wages: 94000,
      medicare_wages: 94000
    },
    ai_summary: 'W-2 from Johnson Properties LLC reporting $94,000 in wages with $18,200 federal withholding. Note: client also has rental income on Schedule E which should be reconciled against this W-2.',
    created_at: daysAgo(3)
  },
  {
    id: 'tdoc_002',
    client_id: 'sub_001',
    client_name: 'Marcus Johnson',
    client_email: 'marcus.johnson@example.com',
    client_phone: '+12025550101',
    doc_type: '1099-MISC',
    tax_year: 2024,
    filename: 'Marcus_Johnson_1099MISC_2024.pdf',
    file_size: 128000,
    status: 'approved',
    uploaded_by_id: 'mbr_001',
    uploaded_by_name: 'Devon Williams',
    uploaded_at: daysAgo(5),
    processing_completed_at: daysAgo(5),
    reviewed_by_id: 'mbr_001',
    reviewed_by_name: 'Devon Williams',
    reviewed_at: daysAgo(4),
    approved_by_id: 'mbr_001',
    approved_by_name: 'Devon Williams',
    approved_at: daysAgo(2),
    esign_token: null,
    esign_sent_at: null,
    esign_url: null,
    signed_at: null,
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: 'Consulting income from Apex Capital',
    extracted_data: {
      payer: 'Apex Capital Management',
      payer_tin: '98-7654321',
      nonemployee_compensation: 32500,
      other_income: 0
    },
    ai_summary: '1099-MISC from Apex Capital Management for $32,500 in nonemployee compensation. This should be reported on Schedule C. Consider SE tax deduction strategies.',
    created_at: daysAgo(5)
  },
  {
    id: 'tdoc_003',
    client_id: 'sub_002',
    client_name: 'Sarah Chen',
    client_email: 'sarah.chen@example.com',
    client_phone: '+12025550102',
    doc_type: '1099-NEC',
    tax_year: 2024,
    filename: 'Sarah_Chen_1099NEC_2024.pdf',
    file_size: 98000,
    status: 'awaiting_signature',
    uploaded_by_id: 'mbr_002',
    uploaded_by_name: 'Aaliyah Torres',
    uploaded_at: daysAgo(7),
    processing_completed_at: daysAgo(7),
    reviewed_by_id: 'mbr_001',
    reviewed_by_name: 'Devon Williams',
    reviewed_at: daysAgo(6),
    approved_by_id: 'mbr_001',
    approved_by_name: 'Devon Williams',
    approved_at: daysAgo(5),
    esign_token: 'tok_sc_1099_2024_abc123',
    esign_sent_at: daysAgo(4),
    esign_url: '/esign/tok_sc_1099_2024_abc123',
    signed_at: null,
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: 'Tech consulting — 3 clients',
    extracted_data: {
      payer: 'TechVentures Inc',
      payer_tin: '45-6789012',
      nonemployee_compensation: 187500
    },
    ai_summary: '1099-NEC showing $187,500 in consulting income. With this level of SE income, S-Corp election analysis is warranted — could save $8,000–$12,000 in self-employment taxes annually.',
    created_at: daysAgo(7)
  },
  {
    id: 'tdoc_004',
    client_id: 'sub_002',
    client_name: 'Sarah Chen',
    client_email: 'sarah.chen@example.com',
    client_phone: '+12025550102',
    doc_type: '1040',
    tax_year: 2024,
    filename: 'Sarah_Chen_1040_Draft_2024.pdf',
    file_size: 892000,
    status: 'signed',
    uploaded_by_id: 'mbr_001',
    uploaded_by_name: 'Devon Williams',
    uploaded_at: daysAgo(10),
    processing_completed_at: daysAgo(10),
    reviewed_by_id: 'mbr_001',
    reviewed_by_name: 'Devon Williams',
    reviewed_at: daysAgo(9),
    approved_by_id: 'mbr_001',
    approved_by_name: 'Devon Williams',
    approved_at: daysAgo(8),
    esign_token: 'tok_sc_1040_2024_xyz789',
    esign_sent_at: daysAgo(7),
    esign_url: '/esign/tok_sc_1040_2024_xyz789',
    signed_at: daysAgo(2),
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: 'Draft 1040 — ready to file pending final review',
    extracted_data: {
      filing_status: 'Single',
      total_income: 187500,
      agi: 175200,
      taxable_income: 152700,
      total_tax: 31840,
      total_payments: 28000,
      refund_or_owed: -3840
    },
    ai_summary: '2024 Form 1040 draft. AGI $175,200, tax owed $31,840 against $28,000 estimated payments — balance due of $3,840. Client should make Q1 2025 estimated payment to avoid underpayment penalty.',
    created_at: daysAgo(10)
  },
  {
    id: 'tdoc_005',
    client_id: 'sub_003',
    client_name: 'David Ramirez',
    client_email: 'dramirez@example.com',
    client_phone: '+12025550103',
    doc_type: '1099-K',
    tax_year: 2024,
    filename: 'David_Ramirez_1099K_Stripe_2024.pdf',
    file_size: 156000,
    status: 'uploaded',
    uploaded_by_id: 'mbr_003',
    uploaded_by_name: 'Marcus Pierce',
    uploaded_at: hoursAgo(4),
    processing_completed_at: null,
    reviewed_by_id: null,
    reviewed_by_name: null,
    reviewed_at: null,
    approved_by_id: null,
    approved_by_name: null,
    approved_at: null,
    esign_token: null,
    esign_sent_at: null,
    esign_url: null,
    signed_at: null,
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: 'Stripe 1099-K for e-commerce',
    extracted_data: null,
    ai_summary: null,
    created_at: hoursAgo(4)
  },
  {
    id: 'tdoc_006',
    client_id: 'sub_003',
    client_name: 'David Ramirez',
    client_email: 'dramirez@example.com',
    client_phone: '+12025550103',
    doc_type: 'Schedule-C',
    tax_year: 2024,
    filename: 'David_Ramirez_ScheduleC_2024.pdf',
    file_size: 210000,
    status: 'filed',
    uploaded_by_id: 'mbr_001',
    uploaded_by_name: 'Devon Williams',
    uploaded_at: daysAgo(14),
    processing_completed_at: daysAgo(14),
    reviewed_by_id: 'mbr_001',
    reviewed_by_name: 'Devon Williams',
    reviewed_at: daysAgo(13),
    approved_by_id: 'mbr_001',
    approved_by_name: 'Devon Williams',
    approved_at: daysAgo(12),
    esign_token: 'tok_dr_schc_2024_def456',
    esign_sent_at: daysAgo(11),
    esign_url: '/esign/tok_dr_schc_2024_def456',
    signed_at: daysAgo(9),
    filed_at: daysAgo(7),
    rejected_at: null,
    rejection_reason: null,
    notes: 'E-commerce business Schedule C — net profit after COGS and expenses',
    extracted_data: {
      business_name: 'Ramirez Digital Commerce',
      gross_receipts: 428000,
      cogs: 218000,
      gross_profit: 210000,
      total_expenses: 67400,
      net_profit: 142600
    },
    ai_summary: 'Schedule C for Ramirez Digital Commerce. Net profit $142,600. QBI deduction of up to $28,520 may apply. Home office and vehicle deductions appear reasonable.',
    created_at: daysAgo(14)
  },
  {
    id: 'tdoc_007',
    client_id: 'sub_004',
    client_name: 'Priya Patel',
    client_email: 'priya.patel@example.com',
    client_phone: '+12025550104',
    doc_type: 'W-2',
    tax_year: 2024,
    filename: 'Priya_Patel_W2_Google_2024.pdf',
    file_size: 187000,
    status: 'processing',
    uploaded_by_id: 'mbr_002',
    uploaded_by_name: 'Aaliyah Torres',
    uploaded_at: hoursAgo(1),
    processing_completed_at: null,
    reviewed_by_id: null,
    reviewed_by_name: null,
    reviewed_at: null,
    approved_by_id: null,
    approved_by_name: null,
    approved_at: null,
    esign_token: null,
    esign_sent_at: null,
    esign_url: null,
    signed_at: null,
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: 'Google W-2 — RSU income included',
    extracted_data: null,
    ai_summary: null,
    created_at: hoursAgo(1)
  },
  {
    id: 'tdoc_008',
    client_id: 'sub_005',
    client_name: "James O'Connor",
    client_email: 'jim.oconnor@example.com',
    client_phone: '+12025550105',
    doc_type: 'K-1',
    tax_year: 2024,
    filename: "JamesOConnor_K1_OConnorPartners_2024.pdf",
    file_size: 334000,
    status: 'rejected',
    uploaded_by_id: 'mbr_001',
    uploaded_by_name: 'Devon Williams',
    uploaded_at: daysAgo(6),
    processing_completed_at: daysAgo(6),
    reviewed_by_id: 'mbr_001',
    reviewed_by_name: 'Devon Williams',
    reviewed_at: daysAgo(5),
    approved_by_id: null,
    approved_by_name: null,
    approved_at: null,
    esign_token: null,
    esign_sent_at: null,
    esign_url: null,
    signed_at: null,
    filed_at: null,
    rejected_at: daysAgo(5),
    rejection_reason: 'K-1 shows incorrect partner percentage — needs amended K-1 from partnership. Contacted client to request updated document.',
    notes: "Partnership K-1 from O'Connor & Partners",
    extracted_data: {
      partnership_name: "O'Connor & Partners LP",
      partner_share_income: 48200,
      partner_share_deductions: 12400,
      partner_share_credits: 0
    },
    ai_summary: "K-1 from O'Connor & Partners LP. Allocated income $48,200 with $12,400 in deductions. However, partner percentage of 34% appears inconsistent with prior year 28% — verify with partnership agreement.",
    created_at: daysAgo(6)
  }
];

// ── In-memory state ───────────────────────────────────────────────────────────

const state = { docs: MOCK_TAX_DOCS };

let _idCounter = 900;
function newId() { return `tdoc_${(++_idCounter).toString(36)}`; }
function newToken() { return `tok_${Math.random().toString(36).slice(2, 14)}`; }

// ── Queries ───────────────────────────────────────────────────────────────────

function listDocs({ client_id, status, tax_year, doc_type } = {}) {
  let rows = state.docs.slice();
  if (client_id) rows = rows.filter((d) => d.client_id === client_id);
  if (status) rows = rows.filter((d) => d.status === status);
  if (tax_year) rows = rows.filter((d) => d.tax_year === Number(tax_year));
  if (doc_type) rows = rows.filter((d) => d.doc_type === doc_type);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getDoc(id) {
  return state.docs.find((d) => d.id === id) || null;
}

function summary() {
  const all = state.docs;
  const byStatus = {};
  STATUS_ORDER.forEach((s) => { byStatus[s] = all.filter((d) => d.status === s).length; });
  const total = all.length;
  const pending_action = all.filter((d) => ['uploaded', 'processing', 'review', 'approved'].includes(d.status)).length;
  const awaiting_client = all.filter((d) => d.status === 'awaiting_signature').length;
  const completed = all.filter((d) => ['signed', 'filed'].includes(d.status)).length;
  return { total, pending_action, awaiting_client, completed, by_status: byStatus };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function uploadDoc({ client_id, client_name, client_email, client_phone, doc_type, tax_year, filename, file_size, notes }, actor) {
  const doc = {
    id: newId(),
    client_id: client_id || null,
    client_name: client_name || 'Unknown Client',
    client_email: client_email || null,
    client_phone: client_phone || null,
    doc_type: doc_type || 'other',
    tax_year: Number(tax_year) || new Date().getFullYear() - 1,
    filename: filename || 'document.pdf',
    file_size: file_size || 0,
    status: 'uploaded',
    uploaded_by_id: actor.id,
    uploaded_by_name: actor.name,
    uploaded_at: nowIso(),
    processing_completed_at: null,
    reviewed_by_id: null,
    reviewed_by_name: null,
    reviewed_at: null,
    approved_by_id: null,
    approved_by_name: null,
    approved_at: null,
    esign_token: null,
    esign_sent_at: null,
    esign_url: null,
    signed_at: null,
    filed_at: null,
    rejected_at: null,
    rejection_reason: null,
    notes: notes || null,
    extracted_data: null,
    ai_summary: null,
    created_at: nowIso()
  };
  state.docs.unshift(doc);
  logActivity({ actor, action: 'taxdoc.uploaded', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `Uploaded ${doc_type} for ${doc.client_name}` });
  // Simulate async processing for demo: auto-advance to 'processing' state
  setTimeout(() => {
    const d = getDoc(doc.id);
    if (d && d.status === 'uploaded') d.status = 'processing';
  }, 500);
  return doc;
}

function processDoc(id, { extracted_data, ai_summary }, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  doc.status = 'review';
  doc.extracted_data = extracted_data || {};
  doc.ai_summary = ai_summary || null;
  doc.processing_completed_at = nowIso();
  logActivity({ actor, action: 'taxdoc.processed', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `AI extracted data from ${doc.doc_type}` });
  return doc;
}

function approveDoc(id, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  if (!['review', 'rejected'].includes(doc.status)) {
    const e = new Error(`Cannot approve a document in '${doc.status}' status.`); e.status = 409; throw e;
  }
  doc.status = 'approved';
  doc.reviewed_by_id = actor.id;
  doc.reviewed_by_name = actor.name;
  doc.reviewed_at = doc.reviewed_at || nowIso();
  doc.approved_by_id = actor.id;
  doc.approved_by_name = actor.name;
  doc.approved_at = nowIso();
  doc.rejected_at = null;
  doc.rejection_reason = null;
  logActivity({ actor, action: 'taxdoc.approved', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `Approved ${doc.doc_type} for ${doc.client_name}` });
  return doc;
}

function rejectDoc(id, { reason }, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  doc.status = 'rejected';
  doc.reviewed_by_id = actor.id;
  doc.reviewed_by_name = actor.name;
  doc.reviewed_at = nowIso();
  doc.rejected_at = nowIso();
  doc.rejection_reason = reason || 'Rejected — see notes.';
  logActivity({ actor, action: 'taxdoc.rejected', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `Rejected: ${(reason || '').slice(0, 80)}` });
  return doc;
}

async function sendForSignature(id, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  if (doc.status !== 'approved') {
    const e = new Error('Document must be approved before sending for signature.'); e.status = 409; throw e;
  }
  const token = newToken();
  doc.status = 'awaiting_signature';
  doc.esign_token = token;
  doc.esign_url = `/esign/${token}`;
  doc.esign_sent_at = nowIso();
  logActivity({ actor, action: 'taxdoc.esign_sent', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `E-signature request sent to ${doc.client_email || doc.client_name}` });

  // In a real build this would hit DocuSign / HelloSign / SignNow API
  // For now, return the mock link the staff can forward manually
  return { doc, esign_url: doc.esign_url, token, mock: true, message: `Mock: e-signature link generated. In production, this would email ${doc.client_email} automatically.` };
}

function recordSigned(id, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  if (doc.status !== 'awaiting_signature') {
    const e = new Error(`Document is in '${doc.status}' status, not awaiting_signature.`); e.status = 409; throw e;
  }
  doc.status = 'signed';
  doc.signed_at = nowIso();
  logActivity({ actor, action: 'taxdoc.signed', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `${doc.client_name} signed ${doc.doc_type}` });
  return doc;
}

function markFiled(id, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  if (!['signed', 'approved'].includes(doc.status)) {
    const e = new Error(`Document must be signed or approved before marking filed.`); e.status = 409; throw e;
  }
  doc.status = 'filed';
  doc.filed_at = nowIso();
  logActivity({ actor, action: 'taxdoc.filed', target_type: 'tax_doc', target_id: doc.id, target_label: doc.filename, summary: `Filed ${doc.doc_type} for ${doc.client_name} (${doc.tax_year})` });
  return doc;
}

function addNote(id, { note }, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  doc.notes = doc.notes ? `${doc.notes}\n\n[${ts} — ${actor.name}] ${note}` : `[${ts} — ${actor.name}] ${note}`;
  return doc;
}

// Simulate AI processing for uploaded/processing docs (used by the demo "Process" button)
function simulateAiExtraction(id, actor) {
  const doc = getDoc(id);
  if (!doc) { const e = new Error('Document not found.'); e.status = 404; throw e; }
  if (!['uploaded', 'processing'].includes(doc.status)) {
    const e = new Error('Document is not in a processable state.'); e.status = 409; throw e;
  }

  const templates = {
    'W-2': {
      extracted_data: { employer: 'Employer Name LLC', ein: '12-3456789', wages: 85000, federal_tax_withheld: 16200, state_tax_withheld: 4250, state: 'MD' },
      ai_summary: 'W-2 with standard wage income. Federal withholding appears adequate. Verify state filing requirements.'
    },
    '1099-NEC': {
      extracted_data: { payer: 'Client Corp', payer_tin: '98-7654321', nonemployee_compensation: 45000 },
      ai_summary: 'Self-employment income reported. Schedule C required. Consider SEP-IRA contributions to reduce SE tax burden.'
    },
    '1099-K': {
      extracted_data: { payment_settlement_entity: 'Stripe Inc', gross_amount: 312000, num_transactions: 1847 },
      ai_summary: '1099-K from payment processor. Gross receipts must reconcile against books — returns, refunds, and fees reduce taxable income. Schedule C required.'
    },
    '1099-MISC': {
      extracted_data: { payer: 'Payer Entity', nonemployee_compensation: 12000, rents: 0, other_income: 0 },
      ai_summary: '1099-MISC for miscellaneous income. Confirm proper categorization on tax return.'
    },
    'K-1': {
      extracted_data: { entity_name: 'Partnership LLC', ordinary_income: 28000, self_employment_income: 28000 },
      ai_summary: 'Partnership K-1. Verify basis limitations before claiming any deductions. At-risk rules may apply.'
    },
    '1040': {
      extracted_data: { filing_status: 'Single', total_income: 130000, agi: 118000, taxable_income: 96000, total_tax: 18450 },
      ai_summary: 'Form 1040 draft. Review all schedules for accuracy. Confirm QBI deduction eligibility if applicable.'
    },
    'Schedule-C': {
      extracted_data: { business_name: 'Client Business', gross_receipts: 180000, total_expenses: 45000, net_profit: 135000 },
      ai_summary: 'Schedule C. Net profit triggers SE tax. Evaluate S-Corp election for potential savings above $80k net income threshold.'
    }
  };

  const tpl = templates[doc.doc_type] || {
    extracted_data: { document_type: doc.doc_type, year: doc.tax_year },
    ai_summary: `${doc.doc_type} processed. Manual review recommended for accuracy.`
  };

  return processDoc(id, tpl, actor);
}

module.exports = {
  listDocs,
  getDoc,
  summary,
  uploadDoc,
  processDoc,
  approveDoc,
  rejectDoc,
  sendForSignature,
  recordSigned,
  markFiled,
  addNote,
  simulateAiExtraction,
  STATUS_ORDER
};
