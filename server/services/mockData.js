// ─────────────────────────────────────────────────────────────────────────────
// Mock Data — used as fallback when Supabase / external APIs aren't configured
// Every service file references these arrays so the app looks fully functional
// with zero env vars set.
// ─────────────────────────────────────────────────────────────────────────────

const now = () => new Date();
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const daysAhead = (d) => new Date(Date.now() + d * 86400000).toISOString();

const MOCK_SUBSCRIBERS = [
  {
    id: 'sub_001',
    name: 'Marcus Johnson',
    email: 'marcus.johnson@example.com',
    phone: '+12025550101',
    tier: 'vip',
    status: 'active',
    subscribed_at: daysAgo(180),
    expires_at: daysAhead(185),
    last_call: hoursAgo(3),
    call_count: 31,
    notes: 'Real estate investor — 12 rental properties',
    created_at: daysAgo(180)
  },
  {
    id: 'sub_002',
    name: 'Sarah Chen',
    email: 'sarah.chen@example.com',
    phone: '+12025550102',
    tier: 'premium',
    status: 'active',
    subscribed_at: daysAgo(95),
    expires_at: daysAhead(270),
    last_call: hoursAgo(18),
    call_count: 14,
    notes: 'Tech consultant — considering S-Corp election',
    created_at: daysAgo(95)
  },
  {
    id: 'sub_003',
    name: 'David Ramirez',
    email: 'dramirez@example.com',
    phone: '+12025550103',
    tier: 'premium',
    status: 'active',
    subscribed_at: daysAgo(60),
    expires_at: daysAhead(305),
    last_call: daysAgo(2),
    call_count: 9,
    notes: 'E-commerce founder',
    created_at: daysAgo(60)
  },
  {
    id: 'sub_004',
    name: 'Priya Patel',
    email: 'priya.patel@example.com',
    phone: '+12025550104',
    tier: 'standard',
    status: 'active',
    subscribed_at: daysAgo(40),
    expires_at: daysAhead(325),
    last_call: daysAgo(1),
    call_count: 6,
    notes: 'W-2 employee exploring backdoor Roth',
    created_at: daysAgo(40)
  },
  {
    id: 'sub_005',
    name: 'James O\'Connor',
    email: 'jim.oconnor@example.com',
    phone: '+12025550105',
    tier: 'vip',
    status: 'active',
    subscribed_at: daysAgo(220),
    expires_at: daysAhead(145),
    last_call: hoursAgo(40),
    call_count: 22,
    notes: 'Retired — focus on RMDs & Roth conversions',
    created_at: daysAgo(220)
  },
  {
    id: 'sub_006',
    name: 'Aisha Williams',
    email: 'aisha.w@example.com',
    phone: '+12025550106',
    tier: 'standard',
    status: 'active',
    subscribed_at: daysAgo(25),
    expires_at: daysAhead(340),
    last_call: daysAgo(5),
    call_count: 3,
    notes: 'New subscriber — recent home purchase',
    created_at: daysAgo(25)
  },
  {
    id: 'sub_007',
    name: 'Robert Kim',
    email: 'rkim@example.com',
    phone: '+12025550107',
    tier: 'premium',
    status: 'expired',
    subscribed_at: daysAgo(400),
    expires_at: daysAgo(35),
    last_call: daysAgo(40),
    call_count: 11,
    notes: 'Let subscription lapse — reach out for renewal',
    created_at: daysAgo(400)
  },
  {
    id: 'sub_008',
    name: 'Elena Martinez',
    email: 'elena.m@example.com',
    phone: '+12025550108',
    tier: 'premium',
    status: 'active',
    subscribed_at: daysAgo(130),
    expires_at: daysAhead(235),
    last_call: hoursAgo(2),
    call_count: 18,
    notes: 'Short-term rental operator — 3 Airbnbs',
    created_at: daysAgo(130)
  }
];

const MOCK_CALLS = [
  {
    id: 'call_001',
    bland_call_id: 'bl_a8f9c2',
    caller_number: '+12025550102',
    subscriber_id: 'sub_002',
    client_name: 'Sarah Chen',
    duration_seconds: 512,
    summary: 'Client asked about S-Corp election timing before year-end. Discussed reasonable salary requirements and the payroll tax savings breakdown at her $240k net income. Recommended booking consultation to run exact numbers and file Form 2553.',
    topics_discussed: ['S-Corp election', 'Reasonable salary', 'Self-employment tax'],
    action_needed: false,
    booking_made: true,
    transferred: false,
    recording_url: 'https://mock.bland.ai/recording/call_001.mp3',
    appointment_details: 'S-Corp consultation booked',
    sms_sent: true,
    called_at: hoursAgo(18)
  },
  {
    id: 'call_002',
    bland_call_id: 'bl_b3e721',
    caller_number: '+12025550101',
    subscriber_id: 'sub_001',
    client_name: 'Marcus Johnson',
    duration_seconds: 687,
    summary: 'Client plans to sell a rental property ($680k basis, $1.1M sale price) and asked about deferring capital gains. Walked through 1031 exchange requirements, 45-day identification window, and qualified intermediary selection. Booked follow-up to review replacement property candidates.',
    topics_discussed: ['1031 exchange', 'Rental property', 'Capital gains deferral'],
    action_needed: false,
    booking_made: true,
    transferred: false,
    recording_url: 'https://mock.bland.ai/recording/call_002.mp3',
    appointment_details: '1031 exchange strategy session',
    sms_sent: true,
    called_at: hoursAgo(3)
  },
  {
    id: 'call_003',
    bland_call_id: 'bl_c1d504',
    caller_number: '+12025550103',
    subscriber_id: 'sub_003',
    client_name: 'David Ramirez',
    duration_seconds: 405,
    summary: 'Client received IRS CP2000 notice regarding underreported 1099-K income from payment processors. Transferred to human staff for immediate review — appears to be a duplicate reporting issue between Stripe and PayPal.',
    topics_discussed: ['IRS letter', 'CP2000 notice', '1099-K reconciliation'],
    action_needed: true,
    booking_made: false,
    transferred: true,
    recording_url: 'https://mock.bland.ai/recording/call_003.mp3',
    appointment_details: null,
    sms_sent: true,
    called_at: daysAgo(2)
  },
  {
    id: 'call_004',
    bland_call_id: 'bl_d9e138',
    caller_number: '+12025550104',
    subscriber_id: 'sub_004',
    client_name: 'Priya Patel',
    duration_seconds: 342,
    summary: 'W-2 employee at tech company with after-tax 401k option. Walked through mega backdoor Roth mechanics — $46,000 additional Roth capacity beyond the $23k employee deferral. Explained in-plan conversion vs in-service distribution. Client will confirm plan supports it and call back.',
    topics_discussed: ['Mega backdoor Roth', '401k', 'After-tax contributions'],
    action_needed: false,
    booking_made: false,
    transferred: false,
    recording_url: 'https://mock.bland.ai/recording/call_004.mp3',
    appointment_details: null,
    sms_sent: true,
    called_at: daysAgo(1)
  },
  {
    id: 'call_005',
    bland_call_id: 'bl_e7f942',
    caller_number: '+12025550106',
    subscriber_id: 'sub_006',
    client_name: 'Aisha Williams',
    duration_seconds: 298,
    summary: 'New homeowner running a consulting side business from a home office. Covered Section 280A Augusta Rule (14 days of tax-free rental to own business), home office deduction calculation on 180 sqft dedicated space, and depreciation recapture on sale. Booked consultation to document properly.',
    topics_discussed: ['Home office deduction', 'Augusta Rule', 'Section 280A'],
    action_needed: false,
    booking_made: true,
    transferred: false,
    recording_url: 'https://mock.bland.ai/recording/call_005.mp3',
    appointment_details: 'Home office strategy consult',
    sms_sent: true,
    called_at: daysAgo(5)
  },
  {
    id: 'call_006',
    bland_call_id: 'bl_f2a683',
    caller_number: '+12025550108',
    subscriber_id: 'sub_008',
    client_name: 'Elena Martinez',
    duration_seconds: 621,
    summary: 'Short-term rental operator asking about cost segregation on newly acquired Airbnb property ($720k purchase). Discussed bonus depreciation phase-down (60% in 2024), real estate professional status, and the material participation test for STRs under 7-day average rental. Recommended cost seg study and booked to review participation logs.',
    topics_discussed: ['Cost segregation', 'Bonus depreciation', 'STR rules', 'Material participation'],
    action_needed: false,
    booking_made: true,
    transferred: false,
    recording_url: 'https://mock.bland.ai/recording/call_006.mp3',
    appointment_details: 'Cost segregation review',
    sms_sent: true,
    called_at: hoursAgo(2)
  }
];

const MOCK_APPOINTMENTS = [
  {
    id: 'appt_001',
    subscriber_id: 'sub_002',
    call_log_id: 'call_001',
    client_name: 'Sarah Chen',
    client_email: 'sarah.chen@example.com',
    client_phone: '+12025550102',
    topic: 'S-Corp election consultation',
    scheduled_at: daysAhead(2),
    duration_min: 30,
    google_event_id: 'mock_gcal_001',
    meet_link: 'https://meet.google.com/mock-sarah-scorp',
    status: 'confirmed',
    notes: 'Review 2024 P&L before call',
    created_at: hoursAgo(18)
  },
  {
    id: 'appt_002',
    subscriber_id: 'sub_001',
    call_log_id: 'call_002',
    client_name: 'Marcus Johnson',
    client_email: 'marcus.johnson@example.com',
    client_phone: '+12025550101',
    topic: '1031 exchange strategy session',
    scheduled_at: daysAhead(3),
    duration_min: 45,
    google_event_id: 'mock_gcal_002',
    meet_link: 'https://meet.google.com/mock-marcus-1031',
    status: 'confirmed',
    notes: 'Bring replacement property shortlist',
    created_at: hoursAgo(3)
  },
  {
    id: 'appt_003',
    subscriber_id: 'sub_006',
    call_log_id: 'call_005',
    client_name: 'Aisha Williams',
    client_email: 'aisha.w@example.com',
    client_phone: '+12025550106',
    topic: 'Home office + Augusta Rule setup',
    scheduled_at: daysAhead(5),
    duration_min: 30,
    google_event_id: 'mock_gcal_003',
    meet_link: 'https://meet.google.com/mock-aisha-home',
    status: 'confirmed',
    notes: null,
    created_at: daysAgo(5)
  },
  {
    id: 'appt_004',
    subscriber_id: 'sub_008',
    call_log_id: 'call_006',
    client_name: 'Elena Martinez',
    client_email: 'elena.m@example.com',
    client_phone: '+12025550108',
    topic: 'Cost segregation study review',
    scheduled_at: daysAhead(7),
    duration_min: 45,
    google_event_id: 'mock_gcal_004',
    meet_link: 'https://meet.google.com/mock-elena-costseg',
    status: 'confirmed',
    notes: 'STR participation logs attached',
    created_at: hoursAgo(2)
  }
];

const MOCK_EMAILS = [
  {
    id: 'email_001',
    gmail_message_id: 'gm_001',
    subscriber_id: 'sub_002',
    client_name: 'Sarah Chen',
    client_email: 'sarah.chen@example.com',
    subject: 'Quick question about S-Corp salary',
    body: 'Hi team, following up on yesterday\'s call — for reasonable salary, is $90k a defensible number for a $240k net year as a tech consultant? Thanks!',
    received_at: hoursAgo(6),
    classification: 'question',
    urgency: 'low',
    needs_human: false,
    status: 'sent',
    ai_draft: 'Hi Sarah, a $90k salary on $240k net is generally defensible for a solo tech consultant based on BLS data for comparable W-2 roles...',
    sent_at: hoursAgo(5),
    season: 'PEAK_SEASON'
  },
  {
    id: 'email_002',
    gmail_message_id: 'gm_002',
    subscriber_id: 'sub_004',
    client_name: 'Priya Patel',
    client_email: 'priya.patel@example.com',
    subject: 'Backdoor Roth timing for 2024',
    body: 'Can I still do a backdoor Roth for 2024 if I contribute in February 2025? Want to make sure I don\'t miss the window.',
    received_at: hoursAgo(12),
    classification: 'question',
    urgency: 'medium',
    needs_human: false,
    status: 'sent',
    ai_draft: 'Hi Priya, yes — you have until the April 15 tax filing deadline to make 2024 IRA contributions...',
    sent_at: hoursAgo(11),
    season: 'PEAK_SEASON'
  },
  {
    id: 'email_003',
    gmail_message_id: 'gm_003',
    subscriber_id: 'sub_003',
    client_name: 'David Ramirez',
    client_email: 'dramirez@example.com',
    subject: 'IRS Notice CP2000 — received today',
    body: 'I got an IRS CP2000 notice claiming I owe $14,230 in additional tax. The 1099-K numbers look wrong — PayPal and Stripe both reported the same transactions. Urgent — please advise.',
    received_at: hoursAgo(4),
    classification: 'irs_notice',
    urgency: 'high',
    needs_human: true,
    status: 'review_needed',
    ai_draft: null,
    sent_at: null,
    season: 'PEAK_SEASON'
  },
  {
    id: 'email_004',
    gmail_message_id: 'gm_004',
    subscriber_id: 'sub_001',
    client_name: 'Marcus Johnson',
    client_email: 'marcus.johnson@example.com',
    subject: 'Documents for 1031 exchange',
    body: 'What docs should I bring Thursday? Settlement statements? Appraisals? Just want to be ready.',
    received_at: minsAgo(45),
    classification: 'logistics',
    urgency: 'low',
    needs_human: false,
    status: 'pending',
    ai_draft: null,
    sent_at: null,
    season: 'PEAK_SEASON'
  }
];

const MOCK_REVIEW_QUEUE = [
  {
    id: 'rq_001',
    type: 'email',
    email_log_id: 'email_003',
    call_log_id: null,
    client_name: 'David Ramirez',
    subject: 'IRS Notice CP2000 — received today',
    reason_flagged: 'IRS correspondence requires human review before response. Potential audit exposure.',
    urgency: 'high',
    status: 'open',
    assigned_to: null,
    resolved_at: null,
    notes: null,
    created_at: hoursAgo(4)
  },
  {
    id: 'rq_002',
    type: 'call',
    email_log_id: null,
    call_log_id: 'call_003',
    client_name: 'David Ramirez',
    subject: 'Amended return likely needed — duplicate 1099-K reporting',
    reason_flagged: 'Complex amended return situation — involves coordination with two payment processors.',
    urgency: 'high',
    status: 'open',
    assigned_to: 'staff@wbcpa.com',
    resolved_at: null,
    notes: 'Client transferred to staff line during call',
    created_at: daysAgo(2)
  }
];

const MOCK_CONFIG = {
  current_season: 'PEAK_SEASON',
  voice_agent_enabled: true,
  auto_send_enabled: true,
  agent_name: 'WBCPA Super Agent'
};

const MOCK_CLIENTS = [
  {
    id: 'cli_001',
    name: 'Marcus Johnson',
    email: 'marcus.johnson@example.com',
    entity_type: 'S-Corp',
    next_deadline: daysAhead(9),
    next_deadline_type: 'Q1 Estimated Tax',
    revenue_annual: 1250000
  },
  {
    id: 'cli_002',
    name: 'Sarah Chen',
    email: 'sarah.chen@example.com',
    entity_type: 'LLC',
    next_deadline: daysAhead(12),
    next_deadline_type: 'S-Corp Election Deadline',
    revenue_annual: 240000
  },
  {
    id: 'cli_003',
    name: 'Elena Martinez',
    email: 'elena.m@example.com',
    entity_type: 'LLC',
    next_deadline: daysAhead(4),
    next_deadline_type: 'Schedule E Filing',
    revenue_annual: 380000
  }
];

module.exports = {
  MOCK_SUBSCRIBERS,
  MOCK_CALLS,
  MOCK_APPOINTMENTS,
  MOCK_EMAILS,
  MOCK_REVIEW_QUEUE,
  MOCK_CONFIG,
  MOCK_CLIENTS
};
