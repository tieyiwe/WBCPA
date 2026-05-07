// ─────────────────────────────────────────────────────────────────────────────
// Rich AI Agent Service
// In-app AI assistant for WBCPA staff. Powered by OpenAI GPT-4o.
// Has function-calling access to all app data: subscribers, calls, emails,
// appointments, escalations, tax documents, and tasks.
// Falls back to a canned stub when OPENAI_API_KEY is not configured.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o';

// ── In-memory conversation store (per actor) ─────────────────────────────────
// Keyed by actor.id. Each value: { messages: [...], focusedClientId, createdAt }
const sessions = {};

function getSession(actorId) {
  if (!sessions[actorId]) {
    sessions[actorId] = { messages: [], focusedClientId: null, createdAt: new Date().toISOString() };
  }
  return sessions[actorId];
}

function clearSession(actorId) {
  sessions[actorId] = { messages: [], focusedClientId: null, createdAt: new Date().toISOString() };
  return { ok: true };
}

// ── Tool/function definitions for OpenAI function calling ────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_client_profile',
      description: 'Get detailed profile and history for a specific subscriber/client by ID or name.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'The client/subscriber ID (e.g. sub_001)' },
          client_name: { type: 'string', description: 'Partial name search if ID not known' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_clients',
      description: 'Search clients/subscribers by name, email, tier, or keyword.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name, email, or keyword to search' },
          tier: { type: 'string', enum: ['vip', 'premium', 'standard', 'trial'], description: 'Filter by subscription tier' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_call_history',
      description: 'Get recent call logs, optionally filtered by client.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Filter by client ID' },
          limit: { type: 'number', description: 'Max results (default 10)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_call_transcript',
      description: 'Get the full transcript and AI summary for a specific call.',
      parameters: {
        type: 'object',
        properties: {
          call_id: { type: 'string', description: 'The call log ID' }
        },
        required: ['call_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_tax_documents',
      description: 'Get tax documents for a client or list all documents with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Filter by client ID' },
          status: { type: 'string', description: 'Filter by status: uploaded, processing, review, approved, awaiting_signature, signed, filed, rejected' },
          tax_year: { type: 'number', description: 'Filter by tax year (e.g. 2024)' },
          doc_type: { type: 'string', description: 'Filter by type: W-2, 1099-NEC, 1099-K, 1099-MISC, K-1, 1040, Schedule-C, other' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_appointments',
      description: 'Get upcoming or recent appointments, optionally filtered by client.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Filter by client ID' },
          limit: { type: 'number', description: 'Max results (default 10)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_escalations',
      description: 'Get current escalations (AI-flagged calls and emails requiring human review).',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['active', 'open', 'mine', 'all'], description: 'Which escalations to list' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_email_queue',
      description: 'Get emails currently in the AI review/response queue.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_tasks',
      description: 'Get current tasks on the task board.',
      parameters: {
        type: 'object',
        properties: {
          assigned_to: { type: 'string', description: 'Filter by assignee name or ID' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Filter by status' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_irs_guidance',
      description: 'Search Rich\'s built-in IRS and tax knowledge base for rules, codes, limits, and strategies.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Tax topic, form, code section, or concept to look up (e.g. "S-Corp election", "QBI deduction", "1031 exchange")' }
        },
        required: ['topic']
      }
    }
  }
];

// ── Tool execution — reads from in-memory mock data ──────────────────────────

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
        const data = getEmailQueue ? getEmailQueue() : { queue: MOCK_REVIEW_QUEUE };
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

  // Match topic to entries
  const matches = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (t.includes(key) || key.includes(t) || entry.title.toLowerCase().includes(t)) {
      matches.push(entry);
    }
  }

  // Broader keyword match
  if (matches.length === 0) {
    const keywords = { 'self.employ': 'scorp', 'salary': 'scorp', 'rental': '1031', 'real estate': '1031', 'ira': 'sep', 'roth': 'backdoor roth', 'depreci': 'depreciation', 'home': 'home office', 'quarterly': 'estimated tax', 'partner': 'k-1', 'notice': 'cp2000', 'stock': 'cost basis', 'crypto': 'cost basis' };
    for (const [kw, key] of Object.entries(keywords)) {
      if (t.includes(kw)) matches.push(entries[key]);
    }
  }

  if (matches.length === 0) {
    return { found: false, message: `No specific IRS guidance found for "${topic}". Rich can still help — ask me directly and I'll draw on my training data.` };
  }

  return { found: true, results: matches };
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(actor) {
  return `You are Rich, the expert AI tax advisor and workflow assistant for WBCPA (Warren B. CPA). You are speaking with ${actor.name} (${actor.role}).

## Your expertise
You are a seasoned CPA with deep knowledge of:
- Individual income taxes (Form 1040, Schedule C/D/E/F, AMT)
- Business entities (S-Corps, partnerships, LLCs, C-Corps)
- Self-employment and payroll tax planning
- Real estate taxation (§1031 exchanges, depreciation, cost segregation)
- Retirement accounts (SEP-IRA, Solo 401k, Roth conversions, Backdoor Roth)
- IRS notices, audits, and tax controversy
- Estate and gift tax planning
- Cryptocurrency taxation
- Tax strategy and minimization

## What you can do
You have real-time access to all WBCPA data via function calls:
- Client/subscriber profiles and history
- Call transcripts and AI summaries
- Tax documents (W-2s, 1099s, K-1s, 1040s, etc.) in the workflow system
- Appointments and scheduling
- Escalations (AI-flagged issues needing human review)
- Email queue
- Task board
- Built-in IRS knowledge base

## How you work
- When a staff member asks about a specific client, use get_client_profile or search_clients first to pull their data before answering
- Reference actual document data, call history, and notes when giving advice
- Be specific and actionable — not generic
- Cite IRS code sections, form numbers, and deadlines where relevant
- If a document needs attention (e.g., rejected K-1, overdue signature), proactively flag it
- You can help draft email responses, resolution notes, and client-facing communications
- Format responses with clear headings and bullet points for readability

## Tone
Professional but approachable. You are a colleague, not a compliance robot. Be direct, practical, and smart.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}`;
}

// ── Mock fallback when no OpenAI key ─────────────────────────────────────────

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
  return `Hi! I'm Rich, WBCPA's AI tax advisor. I have access to all client data, call history, tax documents, and the full IRS knowledge base.\n\nI'm running in **demo mode** (no OpenAI API key configured) so I'm giving canned responses. With a live API key, I'll answer with real data from your system.\n\nThings I can help with:\n- **Client tax strategy** — pull up any client and advise based on their actual situation\n- **Document review** — analyze W-2s, 1099s, K-1s, and flag issues\n- **IRS questions** — S-Corp elections, QBI deductions, 1031 exchanges, CP2000 notices\n- **Workflow** — what escalations are open, what documents need attention\n\nWhat would you like to work on?`;
}

// ── Main chat function ────────────────────────────────────────────────────────

async function chat(actorId, actorInfo, userMessage) {
  const session = getSession(actorId);

  // Append user message
  session.messages.push({ role: 'user', content: userMessage });

  // Mock mode
  if (!OPENAI_API_KEY) {
    const reply = mockReply(userMessage);
    session.messages.push({ role: 'assistant', content: reply });
    return { reply, mock: true, messages: session.messages };
  }

  // Build messages array with system prompt
  const systemMsg = { role: 'system', content: buildSystemPrompt(actorInfo) };
  const chatMessages = [systemMsg, ...session.messages];

  // OpenAI API call with function calling
  let maxRounds = 8;
  let currentMessages = chatMessages;

  while (maxRounds-- > 0) {
    let response;
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: OPENAI_MODEL,
          messages: currentMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 2000,
          temperature: 0.3
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      response = res.data.choices[0];
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message;
      session.messages.push({ role: 'assistant', content: `[Error contacting OpenAI: ${errMsg}]` });
      return { reply: `I encountered an error: ${errMsg}`, error: errMsg, messages: session.messages };
    }

    const msg = response.message;

    if (response.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
      // Execute tool calls
      currentMessages = [...currentMessages, msg];
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        const result = executeTool(tc.function.name, args);
        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }
      // Continue loop for the model to process tool results
    } else {
      // Final text response
      const reply = msg.content || '';
      session.messages.push({ role: 'assistant', content: reply });
      return { reply, messages: session.messages };
    }
  }

  const fallback = 'I ran into a loop processing your request. Please try rephrasing.';
  session.messages.push({ role: 'assistant', content: fallback });
  return { reply: fallback, messages: session.messages };
}

module.exports = { chat, getSession, clearSession };
