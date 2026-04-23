// ─────────────────────────────────────────────────────────────────────────────
// Shared formatting / display utilities.
// ─────────────────────────────────────────────────────────────────────────────

export function timeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);

  if (abs < 45_000) return 'just now';
  const mins = Math.round(abs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

export function initials(name) {
  if (!name) return '??';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function tierColor(tier) {
  if (tier === 'vip') return 'gold';
  if (tier === 'premium') return 'blue';
  return 'green';
}

export function statusColor(status) {
  if (status === 'active') return 'green';
  if (status === 'trial') return 'blue';
  return 'red';
}

export function formatCurrency(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(amount));
}

export function formatPhone(raw) {
  if (!raw) return '—';
  const digits = String(raw).replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function formatET(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }) + ' ET';
}

export function formatDateET(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}
