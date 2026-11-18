/* Money, numbers and dates, the same way on every screen and every print. */

export const MINUS = '−';

export function rs(n: number, opts: { sign?: boolean; cur?: string } = {}): string {
  // Shops count in whole rupees: paisa from shared discounts are rounded away on screen and paper.
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v).toLocaleString('en-US');
  const sign = v < 0 ? MINUS : opts.sign && v > 0 ? '+' : '';
  return `${sign}${opts.cur || 'PKR'} ${abs}`;
}

/** Rupees as printed on a receipt or sent to a customer: "Rs 1,250". */
export function rsr(n: number): string {
  return rs(n, { cur: 'Rs' });
}

export function num(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function pct(n: number, digits = 1): string {
  if (!isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

/* ---------- dates (local time) ---------- */

export function ymd(d: Date | string = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dShort(s: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dTime(s: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  if (isNaN(d.getTime())) return '—';
  let h = d.getHours();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

export function dFull(s: string | Date): string {
  return `${dShort(s)}, ${dTime(s)}`;
}

export function dayLabel(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function daysAgo(s: string): number {
  return Math.floor((startOfDay(new Date()).getTime() - startOfDay(new Date(s)).getTime()) / 86400000);
}

export function relDay(s: string): string {
  const n = daysAgo(s);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 30) return `${n} days ago`;
  const m = Math.floor(n / 30);
  return m === 1 ? '1 month ago' : `${m} months ago`;
}

/* ---------- period filter ---------- */

export type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | '30d' | '90d' | 'year' | 'all' | 'custom';

export interface Range {
  key: RangeKey;
  from: Date;
  to: Date; // exclusive
  label: string;
}

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  month: 'This month',
  lastMonth: 'Last month',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  year: 'This year',
  all: 'All time',
  custom: 'Custom',
};

export function makeRange(key: RangeKey, cFrom?: string, cTo?: string): Range {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  let from = today;
  let to = tomorrow;
  switch (key) {
    case 'yesterday':
      from = addDays(today, -1);
      to = today;
      break;
    case 'week': {
      const dow = (today.getDay() + 6) % 7; // Monday first
      from = addDays(today, -dow);
      break;
    }
    case 'month':
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'lastMonth':
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case '30d':
      from = addDays(today, -29);
      break;
    case '90d':
      from = addDays(today, -89);
      break;
    case 'year':
      from = new Date(today.getFullYear(), 0, 1);
      break;
    case 'all':
      from = new Date(2000, 0, 1);
      break;
    case 'custom':
      from = cFrom ? new Date(cFrom + 'T00:00:00') : today;
      to = cTo ? addDays(new Date(cTo + 'T00:00:00'), 1) : tomorrow;
      break;
  }
  const label =
    key === 'custom' ? `${dShort(from)} – ${dShort(addDays(to, -1))}` : RANGE_LABELS[key];
  return { key, from, to, label };
}

/** The same length of time just before the range, for "vs previous" comparisons. */
export function prevRange(r: Range): Range | null {
  if (r.key === 'all') return null;
  const len = r.to.getTime() - r.from.getTime();
  return { key: 'custom', from: new Date(r.from.getTime() - len), to: new Date(r.from), label: 'previous period' };
}

export function inRange(s: string, r: Range): boolean {
  const t = new Date(s).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
}

export function eachDay(r: Range, max = 120): string[] {
  const out: string[] = [];
  let d = startOfDay(r.from);
  const end = r.to;
  // An "all time" range starts from the first record instead of the year 2000.
  while (d < end && out.length < 2000) {
    out.push(ymd(d));
    d = addDays(d, 1);
  }
  return out.slice(-max);
}

/* ---------- phone / WhatsApp ---------- */

/** 0300-1234567 → 923001234567 (wa.me wants the number with country code and no +). */
export function waNumber(phone?: string): string {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '92' + p.slice(1);
  if (p.length === 10 && p.startsWith('3')) p = '92' + p;
  return p;
}

export function waLink(phone: string | undefined, text: string): string {
  const n = waNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] || '')).toUpperCase() || 'U';
}

export async function hashPin(username: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`mts:${username.trim().toLowerCase()}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
}

export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Rupees in words for receipts: 15,250 → "Fifteen thousand two hundred fifty rupees only". */
export function inWords(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'Zero rupees only';
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (x: number) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
  const three = (x: number) => (x >= 100 ? a[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(three(crore) + ' crore');
  if (lakh) parts.push(two(lakh) + ' lakh');
  if (thousand) parts.push(two(thousand) + ' thousand');
  if (rest) parts.push(three(rest));
  const s = parts.join(' ') + ' rupees only';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
