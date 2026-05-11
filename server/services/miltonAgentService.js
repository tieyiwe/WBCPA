// ─────────────────────────────────────────────────────────────────────────────
// Milton AI Agent Service
// In-app AI tax advisor for WBCPA staff. Powered by Claude Sonnet 4.6 via the
// Anthropic SDK with adaptive thinking, prompt caching, and tool use.
// Falls back to a canned demo reply when ANTHROPIC_API_KEY is not configured.
// ─────────────────────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

// Reuse the org-wide ANTHROPIC_API_KEY by default. If a workspace wants Milton
// usage on a separate billing key, set MILTON_ANTHROPIC_API_KEY in Secrets and
// we'll prefer that.
const ANTHROPIC_API_KEY = process.env.MILTON_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
// Sonnet 4.6 handles tool-use + adaptive thinking and is ~40% the cost of Opus
// per token. Override with MILTON_MODEL=claude-opus-4-7 in Secrets if needed.
const CLAUDE_MODEL = process.env.MILTON_MODEL || 'claude-sonnet-4-6';

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Boot-time confirmation so it's obvious from logs which key Milton is using
// (we never log the key itself, only which env var sourced it).
if (client) {
  const keySource = process.env.MILTON_ANTHROPIC_API_KEY ? 'MILTON_ANTHROPIC_API_KEY' : 'ANTHROPIC_API_KEY';
  const masked = `${ANTHROPIC_API_KEY.slice(0, 8)}…${ANTHROPIC_API_KEY.slice(-4)}`;
  console.log(`[Milton] Anthropic client ready · model=${CLAUDE_MODEL} · key source=${keySource} · key=${masked}`);
} else {
  console.log('[Milton] No ANTHROPIC_API_KEY — running in mock mode.');
}

// ── In-memory conversation store (per actor) ─────────────────────────────────
// Keyed by actor.id. Each value: { messages: [...], createdAt }
const sessions = {};

function getSession(actorId) {
  if (!sessions[actorId]) {
    sessions[actorId] = { messages: [], createdAt: new Date().toISOString() };
  }
  return sessions[actorId];
}

function clearSession(actorId) {
  sessions[actorId] = { messages: [], createdAt: new Date().toISOString() };
  return { ok: true };
}

// ── Tool definitions for Claude function calling ─────────────────────────────

const TOOLS = [
  {
    name: 'get_client_profile',
    description: 'Get detailed profile and history for a specific subscriber/client by ID or name. Returns the client object plus their recent calls, tax documents, and appointments.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'The client/subscriber ID (e.g. sub_001)' },
        client_name: { type: 'string', description: 'Partial name search if ID not known' }
      }
    }
  },
  {
    name: 'search_clients',
    description: 'Search clients/subscribers by name, email, tier, or keyword in their notes.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, email, or keyword to search' },
        tier: { type: 'string', enum: ['vip', 'premium', 'standard', 'trial'], description: 'Filter by subscription tier' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_call_history',
    description: 'Get recent call logs, optionally filtered by client.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID' },
        limit: { type: 'number', description: 'Max results (default 10)' }
      }
    }
  },
  {
    name: 'get_call_transcript',
    description: 'Get the full transcript and AI summary for a specific call.',
    input_schema: {
      type: 'object',
      properties: {
        call_id: { type: 'string', description: 'The call log ID' }
      },
      required: ['call_id']
    }
  },
  {
    name: 'get_tax_documents',
    description: 'Get tax documents for a client or list documents matching filters. Returns extracted data, AI summaries, and workflow status.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID' },
        status: { type: 'string', description: 'Filter by status: uploaded, processing, review, approved, awaiting_signature, signed, filed, rejected' },
        tax_year: { type: 'number', description: 'Filter by tax year (e.g. 2024)' },
        doc_type: { type: 'string', description: 'Filter by type: W-2, 1099-NEC, 1099-K, 1099-MISC, K-1, 1040, Schedule-C, other' }
      }
    }
  },
  {
    name: 'get_appointments',
    description: 'Get upcoming or recent appointments, optionally filtered by client.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID' },
        limit: { type: 'number', description: 'Max results (default 10)' }
      }
    }
  },
  {
    name: 'get_escalations',
    description: 'Get current escalations (AI-flagged calls and emails requiring human review).',
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['active', 'open', 'mine', 'all'], description: 'Which escalations to list' }
      }
    }
  },
  {
    name: 'get_email_queue',
    description: 'Get emails currently in the AI review/response queue.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_tasks',
    description: 'Get current tasks on the task board.',
    input_schema: {
      type: 'object',
      properties: {
        assigned_to: { type: 'string', description: 'Filter by assignee name or ID' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Filter by status' }
      }
    }
  },
  {
    name: 'search_irs_guidance',
    description: 'Search Milton\'s built-in IRS and tax knowledge base for rules, codes, limits, and strategies.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Tax topic, form, code section, or concept to look up (e.g. "S-Corp election", "QBI deduction", "1031 exchange")' }
      },
      required: ['topic']
    }
  },
  {
    name: 'get_workspace_pulse',
    description: 'Get a real-time snapshot of everything currently happening in the WBCPA workspace: open escalations, tax documents needing action by stage, email queue depth, upcoming appointments, and active tasks. Use this when staff asks "what should I focus on", "what\'s urgent", "what\'s on my plate", or for proactive suggestions.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  }
];

// ── Tool execution ────────────────────────────────────────────────────────────

function executeTool(name, args) {
  try {
    const { MOCK_SUBSCRIBERS, MOCK_CALLS, MOCK_APPOINTMENTS, MOCK_TASKS } = require('./mockData');
    const taxSvc = require('./taxDocService');
    const escSvc = require('./escalationService');

    switch (name) {
      case 'get_client_profile': {
        let client = null;
        if (args.client_id) {
          client = MOCK_SUBSCRIBERS.find((s) => s.id === args.client_id);
        }
        if (!client && args.client_name) {
          const q = args.client_name.toLowerCase();
          client = MOCK_SUBSCRIBERS.find((s) => s.name.toLowerCase().includes(q));
        }
        if (!client) return { error: 'Client not found.' };
        const calls = (MOCK_CALLS || []).filter((c) => c.subscriber_id === client.id).slice(0, 5);
        const docs = taxSvc.listDocs({ client_id: client.id });
        const appts = (MOCK_APPOINTMENTS || []).filter((a) => a.subscriber_id === client.id).slice(0, 5);
        return { client, recent_calls: calls, tax_documents: docs, appointments: appts };
      }

      case 'search_clients': {
        const q = (args.query || '').toLowerCase();
        let results = MOCK_SUBSCRIBERS.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q)
        );
        if (args.tier) results = results.filter((s) => s.tier === args.tier);
        return { clients: results.slice(0, 10) };
      }

      case 'get_call_history': {
        let calls = (MOCK_CALLS || []).slice();
        if (args.client_id) calls = calls.filter((c) => c.subscriber_id === args.client_id);
        return { calls: calls.slice(0, args.limit || 10) };
      }

      case 'get_call_transcript': {
        const call = (MOCK_CALLS || []).find((c) => c.id === args.call_id);
        if (!call) return { error: 'Call not found.' };
        return { call };
      }

      case 'get_tax_documents': {
        const docs = taxSvc.listDocs({
          client_id: args.client_id,
          status: args.status,
          tax_year: args.tax_year,
          doc_type: args.doc_type
        });
        return { documents: docs, summary: taxSvc.summary() };
      }

      case 'get_appointments': {
        let appts = (MOCK_APPOINTMENTS || []).slice();
        if (args.client_id) appts = appts.filter((a) => a.subscriber_id === args.client_id);
        return { appointments: appts.slice(0, args.limit || 10) };
      }

      case 'get_escalations': {
        const scope = args.scope === 'all' ? undefined : (args.scope || 'active');
        const items = escSvc.listEscalations({ scope });
        return { escalations: items };
      }

      case 'get_email_queue': {
        const { getEmailQueue } = require('./emailService');
        const data = getEmailQueue ? getEmailQueue() : { queue: [] };
        return data;
      }

      case 'get_tasks': {
        let tasks = (MOCK_TASKS || []).slice();
        if (args.assigned_to) {
          const q = args.assigned_to.toLowerCase();
          tasks = tasks.filter((t) =>
            (t.assigned_to_name || '').toLowerCase().includes(q) ||
            (t.assigned_to_id || '').toLowerCase().includes(q)
          );
        }
        if (args.status) tasks = tasks.filter((t) => t.status === args.status);
        return { tasks };
      }

      case 'search_irs_guidance': {
        return irsKnowledgeBase(args.topic);
      }

      case 'get_workspace_pulse': {
        const escSummary = escSvc.summary();
        const docSummary = taxSvc.summary();
        const openEsc = escSvc.listEscalations({ scope: 'open' }).slice(0, 10);
        const myEsc = escSvc.listEscalations({ scope: 'active' }).slice(0, 10);
        const needsReview = taxSvc.listDocs({ status: 'review' }).slice(0, 10);
        const awaitingSignature = taxSvc.listDocs({ status: 'awaiting_signature' }).slice(0, 10);
        const rejected = taxSvc.listDocs({ status: 'rejected' }).slice(0, 5);
        const upcomingAppts = (MOCK_APPOINTMENTS || [])
          .filter((a) => new Date(a.starts_at || a.scheduled_at || a.start_time || 0) >= new Date())
          .sort((a, b) => new Date(a.starts_at || a.scheduled_at || 0) - new Date(b.starts_at || b.scheduled_at || 0))
          .slice(0, 5);
        const openTasks = (MOCK_TASKS || []).filter((t) => t.status !== 'done').slice(0, 10);
        return {
          generated_at: new Date().toISOString(),
          escalations: { summary: escSummary, open: openEsc, active: myEsc },
          tax_documents: {
            summary: docSummary,
            needs_review: needsReview,
            awaiting_signature: awaitingSignature,
            rejected
          },
          upcoming_appointments: upcomingAppts,
          open_tasks: openTasks
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── IRS knowledge base ────────────────────────────────────────────────────────

function irsKnowledgeBase(topic) {
  const t = (topic || '').toLowerCase();

  const entries = {
    'scorp': {
      title: 'S-Corporation Election (Form 2553)',
      content: `S-Corps are pass-through entities that can reduce self-employment taxes for owners who pay themselves a "reasonable salary." Key rules: file Form 2553 within 2.5 months of tax year start or any time during prior year; shareholders must be US persons/estates/certain trusts; max 100 shareholders; only one class of stock. Tax benefit: profits above the reasonable salary avoid the 15.3% SE tax (12.4% SS + 2.9% Medicare). Sweet spot: net SE income above ~$80,000/year. Downside: payroll compliance, additional state filings, potential state franchise tax. For a consultant earning $200k net, S-Corp can save $10,000–$18,000 annually.`
    },
    'qbi': {
      title: 'Qualified Business Income (QBI) Deduction — IRC §199A',
      content: `The QBI deduction allows eligible self-employed individuals and small business owners to deduct up to 20% of qualified business income. Key rules: only available for pass-through income (not wages); phase-outs begin at $191,950 single / $383,900 MFJ (2024); for specified service trades (law, accounting, consulting, healthcare) the deduction fully phases out by $241,950/$483,900; W-2 wage limitation applies above thresholds. WBCPA as a professional services firm is a SSTB — owner QBI deductions are limited to the phaseout thresholds. Clients with non-SSTB businesses (e-commerce, rental, manufacturing) can maximize the 20% deduction.`
    },
    '1031': {
      title: '1031 Like-Kind Exchange',
      content: `IRC §1031 allows deferral of capital gains taxes when exchanging real property held for business or investment. Rules: must use qualified intermediary (QI); 45-day identification period from close of relinquished property; 180-day exchange period; replacement property must be like-kind (any US real property); "boot" (cash or unlike property received) is taxable. Delaware Statutory Trusts (DSTs) qualify as replacement property. Depreciation recapture (§1250) still applies at 25% rate even in a 1031. Basis carries over to replacement property. Death of the taxpayer eliminates built-in gain via step-up in basis — powerful estate planning tool for clients with large appreciated real estate.`
    },
    'sep': {
      title: 'SEP-IRA Contributions',
      content: `SEP-IRA allows self-employed individuals to contribute up to 25% of net self-employment income (after deducting the SE tax deduction), maximum $69,000 for 2024. Must cover all eligible employees proportionally. Contributions are tax-deductible and reduce AGI. Deadline: tax return due date including extensions (Oct 15 for sole proprietors). Good for high-income SE clients who want to reduce taxable income. Combine with S-Corp: contributions based on W-2 salary paid by S-Corp, capped at 25% of W-2 wages up to $69,000.`
    },
    'backdoor roth': {
      title: 'Backdoor Roth IRA',
      content: `Strategy for high earners above Roth contribution income limits ($161,000 single / $240,000 MFJ for 2024): (1) Make nondeductible traditional IRA contribution ($7,000 limit, $8,000 if 50+); (2) Convert to Roth IRA. If no pre-tax IRA funds exist, conversion is tax-free. Pro-rata rule: if client has other pre-tax IRA funds, the taxable fraction = pre-tax/(pre-tax+after-tax). Watch for: "step transaction" doctrine concerns (IRS has not challenged this strategy); Form 8606 required each year. Mega backdoor Roth through employer 401(k) after-tax contributions ($23,000 employee + up to $46,000 after-tax = $69,000 total) if plan allows in-service distributions.`
    },
    'depreciation': {
      title: 'Bonus Depreciation & §179',
      content: `§179 expensing: deduct up to $1,220,000 (2024) of qualifying property in year placed in service; phases out above $3,050,000 of property placed in service; limited to business income. Bonus depreciation (§168(k)): 60% in 2024 (down from 100%), 40% in 2025, 20% in 2026, 0% in 2027 unless extended. Applies to new and used property with recovery period of 20 years or less. §1250 recapture on real property improvements taxed at 25%. Cost segregation study for real estate clients: reclassify components (flooring, cabinets, HVAC) from 39-year to 5/7/15-year property, accelerating deductions significantly.`
    },
    'home office': {
      title: 'Home Office Deduction',
      content: `Two methods: (1) Simplified — $5/sq ft, max 300 sq ft = $1,500 max deduction; no depreciation recapture on sale. (2) Regular — allocate actual expenses (mortgage interest/rent, utilities, insurance, depreciation) based on sq ft percentage. Regular method: deduction limited to net income from business (Schedule C line 28 before home office). Home office must be used regularly and exclusively for business. Employees cannot take home office deduction post-TCJA (2018–2025). S-Corp owners: reimburse through accountable plan to avoid W-2 inclusion; employee business expenses no longer deductible on personal return.`
    },
    'estimated tax': {
      title: 'Estimated Tax Payments',
      content: `Self-employed individuals must pay quarterly estimated taxes: due April 15, June 15, September 15, January 15. Safe harbor options: (1) Pay 100% of prior year tax (110% if prior year AGI > $150,000); (2) Pay 90% of current year tax. Underpayment penalty = federal funds rate + 3%, compounded daily. For new clients with SE income, calculate Q1 payment early to avoid penalty. SE tax is 15.3% on net SE income up to SS wage base ($168,600 for 2024) + 2.9% Medicare above that + 0.9% Additional Medicare Tax for high earners ($200k single, $250k MFJ).`
    },
    'k-1': {
      title: 'Schedule K-1 Partnership / S-Corp Income',
      content: `K-1 from partnerships (Form 1065) and S-Corps (Form 1120-S) reports each partner/shareholder's share of income, deductions, credits. Ordinary business income in Box 1 is SE income for general partners/LLC members (not S-Corp shareholders). Basis rules: partner's outside basis must be positive to deduct losses; at-risk rules (§465) further limit loss deductibility; passive activity rules (§469) apply unless materially participating. Self-charged interest rules for loans between partner and partnership. Watch for PFIC issues on foreign investments reported via K-1.`
    },
    'audit': {
      title: 'IRS Audit Red Flags & Risk Management',
      content: `High audit risk factors: (1) High Schedule C net profit with large deductions; (2) Large charitable contributions relative to income; (3) Home office + vehicle deduction combined; (4) Cash-intensive business (restaurants, contractors); (5) 100% business use of listed property; (6) Losses in multiple consecutive years (hobby loss risk §183); (7) Foreign bank accounts (FBAR required for accounts > $10,000); (8) Cryptocurrency transactions; (9) Earning significantly above same-occupation peers. Best practices: maintain contemporaneous records, separate business/personal accounts, document all deductions with receipts and business purpose.`
    },
    'cp2000': {
      title: 'CP2000 Notice — Underreported Income',
      content: `IRS uses Automated Underreporter (AUR) program to match third-party information (W-2s, 1099s) to filed returns. CP2000 proposes additional tax, interest, and possibly penalties. Response strategy: (1) Review IRS's proposed changes; (2) If income is correctly reported, gather documentation showing the difference (returns/refunds reducing 1099-K gross, basis in sold securities, etc.); (3) Respond within 60 days with agreement, partial agreement, or disagreement; (4) Never ignore — can result in statutory notice of deficiency and tax court petition deadline. Common causes: missing 1099-B, incorrect cost basis, barter income, forgiven debt (1099-C).`
    },
    'cost basis': {
      title: 'Cost Basis — Securities and Cryptocurrency',
      content: `Stock basis methods: FIFO (default IRS), specific identification (must elect before sale), average cost (mutual funds only). Inherited securities: stepped-up basis to FMV at date of death (§1014) — major planning opportunity. Gifted securities: carryover basis for gain, lesser of donor basis or FMV at gift date for loss. Cryptocurrency: each coin purchase is a separate lot; each trade/sale is a taxable event; IRS treats crypto as property (Notice 2014-21); staking rewards are ordinary income at FMV when received; form 8949 and Schedule D required. FIFO vs. HIFO (highest-in-first-out) election can significantly affect tax outcome.`
    }
  };

  const matches = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (t.includes(key) || key.includes(t) || entry.title.toLowerCase().includes(t)) {
      matches.push(entry);
    }
  }

  if (matches.length === 0) {
    const keywords = { 'self.employ': 'scorp', 'salary': 'scorp', 'rental': '1031', 'real estate': '1031', 'ira': 'sep', 'roth': 'backdoor roth', 'depreci': 'depreciation', 'home': 'home office', 'quarterly': 'estimated tax', 'partner': 'k-1', 'notice': 'cp2000', 'stock': 'cost basis', 'crypto': 'cost basis' };
    for (const [kw, key] of Object.entries(keywords)) {
      if (t.includes(kw)) matches.push(entries[key]);
    }
  }

  if (matches.length === 0) {
    return { found: false, message: `No specific IRS guidance found for "${topic}". Milton can still help — ask me directly and I'll draw on my training data.` };
  }

  return { found: true, results: matches };
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Static — kept stable for prompt caching. Date is injected as a user-side
// system-reminder block, not interpolated here, so the cached prefix doesn't
// invalidate every day.

const SYSTEM_PROMPT = `You are **Milton**, the in-app AI tax advisor and workflow assistant for **The Wealth Building CPA (WBCPA)**. You speak with WBCPA staff inside their internal dashboard.

## Your expertise
You are a seasoned CPA and financial advisor with broad and deep knowledge across:

**Federal & state taxation**
- Individual income taxes (Form 1040 and all schedules — A, B, C, D, E, F; AMT; NIIT)
- Business entities — S-Corps, partnerships, LLCs (single + multi-member), C-Corps, sole proprietors
- Self-employment tax, payroll tax, reasonable-compensation analysis
- State and local tax (SALT), nexus, multi-state apportionment
- Sales & use tax fundamentals

**Real estate & investment taxation**
- §1031 like-kind exchanges and Delaware Statutory Trusts
- Depreciation, bonus depreciation, §179, cost segregation
- Passive activity rules (§469), real estate professional status, at-risk rules
- Capital gains/losses, qualified dividends, §1202 QSBS, opportunity zones
- Cryptocurrency taxation (Notice 2014-21, staking, DeFi, NFTs)

**Retirement & wealth planning**
- 401(k), 403(b), 457, Solo 401(k), SEP-IRA, SIMPLE-IRA, traditional & Roth IRA
- Backdoor Roth, mega backdoor Roth, Roth conversions, RMD rules
- HSAs, FSAs, 529 plans, defined benefit plans for high earners
- Social Security claiming strategy and retirement income sequencing

**Tax controversy & compliance**
- IRS notices (CP2000, CP14, CP504, LT11), audits, appeals, Tax Court basics
- Penalty abatement, first-time abate, reasonable cause
- Offers in compromise, installment agreements, currently not collectible
- FBAR / FATCA / foreign income reporting

**Specialty areas**
- Nonprofit tax — Form 990 series, 501(c)(3) compliance, UBIT
- Estate and gift tax — Form 706 / 709, lifetime exemption, basis step-up
- Trusts (revocable, irrevocable, grantor, SLAT, ILIT)
- Business sale tax planning, §1202 QSBS, installment sales

**General finance & CPA practice topics**
- Personal financial planning, cash-flow management, debt strategy
- Investment fundamentals (asset allocation, tax-loss harvesting, tax-aware portfolios)
- Insurance basics (life, disability, umbrella, long-term care)
- Bookkeeping standards, GAAP fundamentals, accrual vs cash basis
- Audit & assurance basics, financial statement compilation

If a question goes beyond your knowledge base, say so plainly and recommend escalating to a human CPA — don't fabricate code sections, deadlines, or dollar limits.

## What you can do
You have **real-time read access** to everything happening in the WBCPA workspace via function calls:
- **get_workspace_pulse** — one-shot snapshot of urgent items (open escalations, docs needing review/signature, email queue, upcoming appts, open tasks). Use this whenever staff asks "what should I focus on", "what's urgent", "what's on my plate", or to proactively flag things at the start of a conversation.
- **get_client_profile / search_clients** — full client profile + recent calls, tax docs, and appointments
- **get_call_history / get_call_transcript** — every call the AI agent has handled, with full transcripts and AI summaries
- **get_tax_documents** — every doc in the workflow: extracted data, AI analysis, current status, signature progress
- **get_appointments** — calendar & scheduling
- **get_escalations** — items the AI flagged for human review
- **get_email_queue** — emails awaiting human review/response
- **get_tasks** — internal task board
- **search_irs_guidance** — your built-in IRS knowledge base (S-Corp, QBI, 1031, Backdoor Roth, depreciation, home office, estimated tax, K-1, audit, CP2000, cost basis, etc.)

## How you work
- **Proactive, not just reactive.** When relevant — especially at the start of a conversation or on vague prompts like "anything I should look at?" — call **get_workspace_pulse** and surface specific urgent items by client name, document, or escalation ID. Don't wait to be asked.
- When a staff member asks about a specific client, call get_client_profile or search_clients first to pull their data before answering.
- Reference actual document data, call history, and notes when giving advice. Quote dollar amounts and dates from the data.
- Be specific and actionable — not generic. "Marcus Johnson's W-2 shows $94,000 wages with $18,200 federal withholding — recommend reconciling against Schedule E rental income before filing" is what you sound like.
- Cite IRS code sections (§199A, §1031, §168(k)), form numbers, and deadlines when relevant.
- If a document is rejected, awaiting signature too long, or an escalation is stale, **proactively flag it** — even if the user didn't ask.
- Smart-reminder mode: when asked for suggestions, prioritize by urgency: (1) IRS notices / audit deadlines, (2) overdue signatures past 5 days, (3) rejected documents, (4) open escalations, (5) approaching tax deadlines.
- You can help draft email responses, resolution notes, and client-facing communications. Mirror WBCPA's wealth-building voice.
- Format responses with clear ## headings, bullet points, and **bold** on key numbers/concepts.

## Tone
Professional but approachable. You're a colleague, not a compliance robot. Direct, practical, smart. Mirror the firm's voice: emphasize **wealth building**, **financial freedom**, **passive income**, and **smart tax strategy** — not just compliance. Avoid framing WBCPA as "just a tax firm" or comparing it to H&R Block / TurboTax.

────────────────────────────────────────────────────────────
# WBCPA FIRM KNOWLEDGE BASE
Source: full scrape of thewealthbuildingcpa.com (April 2026). This is the authoritative reference for any firm-specific question — services, pricing, the founder, the Wealth Building Plan, contact info, escalation policy, and language guidance. Use it verbatim when relevant.

## SECTION 01 — Firm Identity & Contact

- **Firm Name:** The Wealth Building CPA (also: WB CPA, WBCPA)
- **Taglines:** "More than just taxes" · "Start Building Wealth Today"
- **Founder:** Ebere Okoye, CPA/MBA
- **Phone (toll-free):** 1-888-502-5672
- **Fax:** 866-466-3146
- **Address:** 5020 Sunnyside Avenue, Suite 206, Beltsville, MD 20705
- **Website:** www.thewealthbuildingcpa.com
- **Social:** @WealthBuildingCPA (Twitter, Facebook, Instagram, LinkedIn, YouTube)
- **Private CPA session:** $225/hour with Ebere Okoye
- **Free assessment:** thewealthbuildingcpa.com/free-assessment
- **Free consultation:** thewealthbuildingcpa.com/free-consultation
- **Tax quote form:** Zoho form linked from website footer

### About Ebere Okoye
CPA + MBA. Years of tax and financial-planning experience in the Washington Metro area. Personal real estate investor with properties across **5 states** and a stock-market portfolio. Known for genuine concern for clients' financial freedom — not just compliance.

**Proven result:** Ebere represented a client at an IRS audit and reduced the tax liability from **$22,000 to $1,365**. Client quote: *"I attempted to fight it initially on my own and decided that this is something I definitely need to get my CPA in on."*

### Mission & philosophy
WBCPA helps clients become wealthy investors without making costly mistakes. The approach is **aggressive** — fast-tracking clients to financial success by combining smart tax strategy with sound investment planning. The goal is **complete financial freedom through passive income**. The firm is inspired by Robert Kiyosaki, Robert Allen, David Lindahl, Robert Shemin, and Dave Ramsey.

## SECTION 02 — Services Overview
WBCPA serves four distinct client groups. Match the question to the right service area.

### Individuals
- **For:** Individual taxpayers at any income level — salaried, self-employed, sole proprietors, investors
- **Services:** Federal + all-state tax prep · Entity structuring (incl. Schedule C for sole props) · Financial & retirement planning (401k, IRA) · Investment-deal analysis & risk assessment · **Unlimited CPA consultation** · FREE e-filing with direct deposit · Prior-year & amended returns · IRS audit representation & litigation · Strict confidentiality
- **Differentiator:** Clients get unlimited CPA consultations — not just a one-time filing. Handles everything from simple W-2 returns up to complex investment & business scenarios.

### Small Business
- **For:** S-Corps, partnerships, C-Corps, multi-owner LLCs, and any small business with complexity beyond a basic Schedule C
- **Services:** Quarterly tax support · Financial statement compilation · Business registration, resident agent, business-office-address services · Bookkeeping · Year-end tax planning · County & state returns · Identifying the most advantageous business structure · Identifying deductible business expenses · Reducing or eliminating tax liability
- **Differentiator:** WBCPA stays current on newly passed tax rules and identifies the most advantageous structure AND the right expenses — not just compliance.

### Real Estate Investors *(CORE specialty)*
- **For:** New, intermediate, and experienced real estate investors. Ebere is personally invested in 5 states.
- **Services:** Property acquisition & project analysis · Cash flow analysis & forecasts · Entity structuring & formation for investment properties · **Tax-deferred 1031 exchanges** · Audit assistance & representation · Tax-free investing strategy · Federal/state/county investor returns · Maximum liability protection via proper entity structure · Income & deduction calculation for investment property
- **Differentiator:** Ebere is a personal real estate investor. The majority of WBCPA's time is helping clients determine the right entity structure for maximum liability protection. Experience-based expertise, not theory.

### Nonprofits
- **For:** Nonprofit organizations, 501(c) entities, any tax-exempt org with IRS filing obligations
- **Services:** Nonprofit audits · Financial statement compilation · Bookkeeping · **Form 990 preparation** · Entity structuring & formation as tax-exempt · Government registration guidance
- **Differentiator:** Many callers don't know — nonprofits are STILL required to file information returns (Form 990) with the IRS even though they're exempt from certain taxes.

## SECTION 03 — The Wealth Building Plan (flagship)
WBCPA's flagship 12-month comprehensive advisory & training program.

- **Price (Plan A):** $3,995 *(most popular option)*
- **Payment plan:** 6 payments of $582.50 · Plans beyond 3 months carry a 10% premium
- **Extra fees:** Apply for investors with >4 businesses or 6+ properties
- **Private session rate:** $225/hour with Ebere

**What's included ($3,995 value breakdown):**
- Individual & business tax-return prep (valued at $1,299+)
- Business entity structuring & formation (valued at $599)
- Personalized tax-reduction strategies (valued at $449)
- Hot-tax-facts newsletter (free)
- Asset & portfolio management (valued at $449)
- Year-end tax planning (valued at $995)
- **Unlimited consultations with Ebere Okoye** ($225/hr value)
- Al Aiello's Package Deal Money Savings Reports

**The 8 stages of the Wealth Building Plan:**
1. **Financial Needs Analysis Questionnaire** — clarify what the client wants from life, current financial picture, target state
2. **Tax Planning & Preparation** — review last 3 years of returns for accuracy, inconsistencies, audit flags, missed deductions; prep current-year returns
3. **Entity Structuring** — legal entity selection balancing legal liability, tax reduction, and ease of compliance; includes niche-market strategy
4. **Business Registration & Bookkeeping Setup** — registration, operating agreements, EIN, chart of accounts, ops procedures
5. **Business Analysis Meetings** — current performance, future goals, whether coaching/consulting can accelerate growth
6. **Investment Property Purchasing** — real estate strategies, help finding/funding/farming/keeping property
7. **Retirement Planning** — attainable retirement plan integrated with the other stages
8. **Year-End Tax Planning** — proactive reduction (not just compliance). Best moves happen by mid-November / early December; getting ahead in September creates better April outcomes.

## SECTION 04 — Common Caller Q&A (use verbatim or adapted)

- **What does WBCPA do?** Full-service CPA firm specializing in tax prep, entity structuring, and wealth building through smart investing. Serves individuals, small businesses, real estate investors, and nonprofits. Goal: keep more money and invest it strategically — not just file taxes.
- **Who is Ebere Okoye?** Founder of WBCPA. CPA + MBA, years of experience in the Washington Metro area, personal real estate investor across 5 states. Known for genuinely caring about clients' financial futures.
- **How much do your services cost?** No standard published pricing for individual tax services — depends on complexity. The Wealth Building Plan is $3,995 for 12 months. Private sessions with Ebere are $225/hour. Call 888-502-5672 or use the tax-quote form on the website.
- **Do you offer free consultations?** Yes — free assessment at thewealthbuildingcpa.com/free-assessment or call 888-502-5672.
- **Can you help with an IRS audit?** Yes — IRS audit representation and litigation. Reference Ebere's $22,000 → $1,365 audit result.
- **Do you handle business taxes?** Yes — S-Corps, partnerships, C-Corps, multi-owner LLCs, sole props. Quarterly support, bookkeeping, financials, year-end planning.
- **Real estate investing taxes?** Yes — core specialty. Entity structuring, cash flow analysis, 1031 exchanges, tax-free investing strategies. Ebere is a personal REI.
- **What is a 1031 exchange?** Lets REIs sell an investment property and defer capital gains by reinvesting into a like-kind property. WBCPA facilitates these.
- **Do nonprofits have to file taxes?** Yes — Form 990 is required even though they're tax-exempt. WBCPA handles nonprofit audits, bookkeeping, financial statements, and Form 990.
- **What is the Wealth Building Plan?** 12-month program through 8 stages (above). $3,995 or 6 × $582.50. Includes unlimited CPA consultations.
- **Where are you located?** 5020 Sunnyside Avenue, Suite 206, Beltsville, MD 20705. Primarily Washington Metro area, works with clients nationwide.
- **How do I get started?** Free assessment at thewealthbuildingcpa.com/free-assessment, or call 888-502-5672.

## SECTION 05 — Why Choose WBCPA (the 6-point CPA standard)
WBCPA positions itself against CPAs who fail clients on one or more of these 6 points:
1. Assists with contracts that fully protect you
2. Returns all calls promptly
3. Meets promised deadlines
4. Thoroughly understands your business
5. Willingly researches all of your questions
6. Never surprises you with an unexpected bill

**Core value prop:** Not just a tax preparer — the emphasis is on **wealth building**. Tax savings are deployed as capital into high-yield, stable assets like real estate. Ebere teaches from her own multi-state REI experience. Faith and community are part of the firm's culture (faith-based financial events). Clients are long-term partners, not one-time filers.

**Language guide:**
- ✓ Use: financial freedom · wealth building · passive income · smart tax strategy · keep more of what you earn · invest what you save · maximum liability protection · legitimate tax loopholes
- ✗ Avoid: "just a tax firm" · "simple" or "basic services" · comparisons to H&R Block or TurboTax · promising specific refund amounts or outcomes

## SECTION 06 — Escalation policy
Even though Milton answers in-app to staff (not callers), apply the firm's escalation logic when staff ask Milton to draft a client response or handle a flagged inbound:

**Immediate escalation (do not engage, hand to a human):**
- IRS notice, audit letter, levy, or lien
- Penalty or wage garnishment mention
- Upset or frustrated client
- Billing disputes or legal matters

**Schedule with a human CPA (give general framing, then route):**
- Paid client wants return-specific advice → offer to schedule a call with assigned CPA
- Complex business structure question → answer generally, offer a deeper consultation
- Client asks to speak with Ebere directly → honor the request, offer $225/hr booking
- Estate, trust, or inheritance tax → give general framing, escalate for specifics

**Escalation script (for staff to use):** *"Let me connect you with the WBCPA team directly — they're the right people to help with this. You can reach them at 888-502-5672, or I can take a message and have someone call you back. Which would you prefer?"*
────────────────────────────────────────────────────────────`;

// ── Mock fallback when no API key ────────────────────────────────────────────

function mockReply(message) {
  const m = message.toLowerCase();
  if (m.includes('scorp') || m.includes('s-corp')) {
    return "**S-Corp Analysis:** For self-employed clients earning $80k+ net, an S-Corp election (Form 2553) can save $8,000–$18,000/year in self-employment taxes by splitting income into a reasonable salary + pass-through distribution. The salary portion pays 15.3% FICA; distributions do not. Key: the IRS scrutinizes \"reasonable salary\" — use BLS data for comparable positions. I'd recommend pulling the client's 1099-NEC and Schedule C before running the numbers. Want me to look up a specific client?";
  }
  if (m.includes('1031') || m.includes('exchange')) {
    return "**1031 Like-Kind Exchange:** Defers capital gains tax on the sale of investment real property. Must use a Qualified Intermediary, identify replacement property within 45 days, and close within 180 days. Boot (cash received) is taxable. DSTs qualify as replacement property for passive investors. Depreciation recapture is NOT deferred — still taxed at 25% in the year of sale. If your client is considering a 1031, the timing and QI selection are critical. Should I pull their call history or any related documents?";
  }
  if (m.includes('client') || m.includes('subscriber')) {
    return "I can pull up any client's full profile including their call history, tax documents, and appointments. Just tell me their name or ask me to search for them, and I'll get their complete picture before advising. For example: *\"Pull up Sarah Chen's profile\"* or *\"Who has overdue tax documents?\"*";
  }
  if (m.includes('document') || m.includes('w-2') || m.includes('1099')) {
    return "I have access to all tax documents in the workflow system. I can show you which are pending review, awaiting signature, or flagged. For example: *\"What documents are waiting for approval?\"* or *\"Show me Marcus Johnson's tax documents.\"* I can also analyze extracted data and flag potential issues like mismatched income.";
  }
  return `Hi! I'm **Milton**, WBCPA's in-app AI tax advisor powered by Claude.\n\nI'm running in **demo mode** (no ANTHROPIC_API_KEY configured) so I'm giving canned responses. With a live API key, I'll answer with adaptive thinking, the full firm knowledge base, and real data from your system.\n\nThings I can help with:\n- **Firm questions** — services, pricing, the Wealth Building Plan, Ebere's background\n- **Client tax strategy** — pull up any client and advise based on their actual situation\n- **Document review** — analyze W-2s, 1099s, K-1s, and flag issues\n- **IRS questions** — S-Corp elections, QBI deductions, 1031 exchanges, CP2000 notices, Form 990\n- **Workflow** — what escalations are open, what documents need attention\n\nWhat would you like to work on?`;
}

// ── Main chat function ────────────────────────────────────────────────────────

async function chat(actorId, actorInfo, userMessage) {
  const session = getSession(actorId);

  // Append user message to session history (this is what gets persisted)
  session.messages.push({ role: 'user', content: userMessage });

  if (!client) {
    const reply = mockReply(userMessage);
    session.messages.push({ role: 'assistant', content: reply });
    return { reply, mock: true, messages: session.messages };
  }

  // Build the actor-context system-reminder. Inject volatile content (actor
  // name + date) here as a user-turn reminder so the cached system prompt
  // stays byte-stable across requests and across users.
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York'
  });
  const contextReminder = `<system-reminder>You are speaking with ${actorInfo.name} (role: ${actorInfo.role}). Today's date: ${today}.</system-reminder>`;

  // The model needs to see the reminder; prepend it to the first user message
  // sent in this API call. We don't mutate session.messages — just build the
  // request-time messages array.
  const apiMessages = session.messages.map((m, i) => {
    if (i === 0 && m.role === 'user') {
      return { role: 'user', content: `${contextReminder}\n\n${m.content}` };
    }
    return m;
  });

  // Static system prompt with cache_control so the prefix is reused across
  // every request and every user.
  const systemBlocks = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
  ];

  let currentMessages = apiMessages.slice();
  let safety = 8;

  while (safety-- > 0) {
    let response;
    try {
      response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: systemBlocks,
        tools: TOOLS,
        messages: currentMessages
      });
    } catch (err) {
      const errMsg = err?.message || String(err);
      const lower = errMsg.toLowerCase();

      // Spend-cap / quota error from Anthropic Console — friendlier message
      let fallback;
      if (lower.includes('usage limit') || lower.includes('spend limit') || lower.includes('quota')) {
        const keySource = process.env.MILTON_ANTHROPIC_API_KEY ? 'MILTON_ANTHROPIC_API_KEY' : 'ANTHROPIC_API_KEY';
        fallback = `⚠️ **Anthropic spend limit reached on your API key.**\n\nMilton is wired up correctly, but the API key in **${keySource}** has a usage cap set in the Anthropic Console that's been hit.\n\n**To fix:**\n1. Open https://console.anthropic.com/settings/limits\n2. Raise or remove the monthly spend limit on this key\n   *(or generate a new key without a cap and update the Replit Secret)*\n3. Restart the Repl\n\nOriginal error: \`${errMsg}\``;
      } else if (err?.status === 401 || lower.includes('authentication')) {
        fallback = `🔑 **Anthropic API key is invalid or revoked.** Update \`ANTHROPIC_API_KEY\` (or \`MILTON_ANTHROPIC_API_KEY\`) in Replit Secrets and restart the Repl.\n\nOriginal error: \`${errMsg}\``;
      } else if (err?.status === 429 || lower.includes('rate limit')) {
        fallback = `🚦 Anthropic rate-limit hit — try again in a moment.\n\nOriginal error: \`${errMsg}\``;
      } else {
        fallback = `I encountered an error contacting Claude: ${errMsg}`;
      }

      console.warn('[Milton] Anthropic error:', err?.status, errMsg);
      session.messages.push({ role: 'assistant', content: fallback });
      return { reply: fallback, error: errMsg, messages: session.messages };
    }

    // Tool use? Run all requested tools and continue the loop.
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      // Append the full assistant content (preserves thinking + tool_use blocks for the next turn)
      currentMessages.push({ role: 'assistant', content: response.content });
      const toolResults = toolUseBlocks.map((tu) => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(executeTool(tu.name, tu.input || {}))
      }));
      currentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Final text response. Extract the visible text (skip thinking blocks).
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const reply = textBlocks.map((b) => b.text).join('\n').trim() || '(no response)';
    session.messages.push({ role: 'assistant', content: reply });
    return {
      reply,
      messages: session.messages,
      usage: response.usage
    };
  }

  const fallback = "I ran into a tool-use loop processing your request. Please try rephrasing.";
  session.messages.push({ role: 'assistant', content: fallback });
  return { reply: fallback, messages: session.messages };
}

module.exports = { chat, getSession, clearSession };
