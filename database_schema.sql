-- ─────────────────────────────────────────────────────────────────────────────
-- WBCPA Super Agent — Supabase schema
-- Paste into the Supabase SQL editor and run once to provision.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT where sensible.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── subscribers ─────────────────────────────────────────────────────────────
create table if not exists subscribers (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  email          text unique,
  phone          text unique not null,
  tier           text check (tier in ('standard', 'premium', 'vip')) default 'standard',
  status         text check (status in ('active', 'expired', 'cancelled', 'trial')) default 'active',
  stripe_id      text,
  subscribed_at  timestamptz default now(),
  expires_at     timestamptz,
  last_call      timestamptz,
  call_count     integer default 0,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_subscribers_phone  on subscribers (phone);
create index if not exists idx_subscribers_status on subscribers (status);
create index if not exists idx_subscribers_tier   on subscribers (tier);

-- ─── call_log ────────────────────────────────────────────────────────────────
create table if not exists call_log (
  id                  uuid primary key default gen_random_uuid(),
  bland_call_id       text unique,
  caller_number       text,
  subscriber_id       uuid references subscribers(id) on delete set null,
  client_name         text,
  duration_seconds    integer,
  transcript          text,
  summary             text,
  topics_discussed    text[],
  action_needed       boolean default false,
  booking_made        boolean default false,
  transferred         boolean default false,
  recording_url       text,
  appointment_details text,
  sms_sent            boolean default false,
  called_at           timestamptz default now(),
  created_at          timestamptz default now()
);

create index if not exists idx_call_log_subscriber on call_log (subscriber_id);
create index if not exists idx_call_log_called_at  on call_log (called_at desc);
create index if not exists idx_call_log_action     on call_log (action_needed);

-- ─── appointments ────────────────────────────────────────────────────────────
create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  subscriber_id    uuid references subscribers(id) on delete set null,
  call_log_id      uuid references call_log(id) on delete set null,
  client_name      text,
  client_email     text,
  client_phone     text,
  topic            text,
  scheduled_at     timestamptz not null,
  duration_min     integer default 30,
  google_event_id  text,
  meet_link        text,
  status           text check (status in ('confirmed', 'cancelled', 'completed', 'no_show')) default 'confirmed',
  notes            text,
  created_at       timestamptz default now()
);

create index if not exists idx_appointments_scheduled on appointments (scheduled_at);
create index if not exists idx_appointments_status    on appointments (status);

-- ─── email_log ───────────────────────────────────────────────────────────────
create table if not exists email_log (
  id                 uuid primary key default gen_random_uuid(),
  gmail_message_id   text unique,
  subscriber_id      uuid references subscribers(id) on delete set null,
  client_name        text,
  client_email       text,
  subject            text,
  body               text,
  received_at        timestamptz default now(),
  classification     text,
  urgency            text check (urgency in ('low', 'medium', 'high')),
  needs_human        boolean default false,
  status             text check (status in ('pending', 'draft_created', 'sent', 'review_needed', 'resolved')) default 'pending',
  ai_draft           text,
  sent_at            timestamptz,
  season             text,
  created_at         timestamptz default now()
);

create index if not exists idx_email_log_status on email_log (status);
create index if not exists idx_email_log_received on email_log (received_at desc);

-- ─── review_queue ────────────────────────────────────────────────────────────
create table if not exists review_queue (
  id               uuid primary key default gen_random_uuid(),
  type             text check (type in ('email', 'call')) not null,
  email_log_id     uuid references email_log(id) on delete set null,
  call_log_id      uuid references call_log(id) on delete set null,
  client_name      text,
  subject          text,
  reason_flagged   text,
  urgency          text,
  status           text check (status in ('open', 'in_progress', 'resolved')) default 'open',
  assigned_to      text,
  resolved_at      timestamptz,
  notes            text,
  created_at       timestamptz default now()
);

create index if not exists idx_review_queue_status on review_queue (status);

-- ─── clients (CPA book of business for reminders) ────────────────────────────
create table if not exists clients (
  id                  uuid primary key default gen_random_uuid(),
  name                text,
  email               text,
  entity_type         text,
  next_deadline       timestamptz,
  next_deadline_type  text,
  revenue_annual      numeric,
  created_at          timestamptz default now()
);

create index if not exists idx_clients_next_deadline on clients (next_deadline);

-- ─── system_config ───────────────────────────────────────────────────────────
create table if not exists system_config (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);

insert into system_config (key, value) values
  ('current_season', 'PEAK_SEASON'),
  ('auto_send_enabled', 'true'),
  ('voice_agent_enabled', 'true'),
  ('agent_name', 'WBCPA Super Agent')
on conflict (key) do nothing;
