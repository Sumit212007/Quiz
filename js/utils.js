/* utils.js — small, dependency-free helpers shared by every module. */

/** Lower-case and strip everything except letters/digits: "Unit 3" and "unit3" both become "unit3". */
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const slugify = (s) =>
  String(s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

export const naturalCompare = (a, b) =>
  String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Fisher–Yates shuffle (returns a new array). Uses crypto randomness when available. */
export function shuffle(list) {
  const a = [...list];
  const rand = (n) => {
    if (window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- formatting ---------- */

const pad2 = (n) => String(n).padStart(2, '0');

/** 83 -> "01:23", 3725 -> "1:02:05" (timer display). */
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 83 -> "1m 23s" (human readable duration). */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${pad2(sec % 60)}s`;
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
}

export function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDate(iso);
}

export function fmtPct(n, digits = 0) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toFixed(digits).replace(/\.0+$/, '')}%`;
}

/** Colour tone for an accuracy percentage. */
export const accuracyTone = (v) => (v >= 75 ? 'success' : v >= 50 ? 'warn' : 'danger');

/* ---------- files & errors ---------- */

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turn a JSON.parse error into something with a line/column the user can act on. */
export function parseJsonError(text, err) {
  const msg = String(err?.message ?? err);
  if (/line \d+/i.test(msg)) return msg;
  const m = msg.match(/position (\d+)/i);
  if (m) {
    const pos = Number(m[1]);
    const before = text.slice(0, pos).split('\n');
    return `${msg} (line ${before.length}, column ${before[before.length - 1].length + 1})`;
  }
  return msg;
}
