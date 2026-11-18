/* ui.js — tiny DOM toolkit: element builder, icons, modal, toast and reusable page pieces.
 * Text is always inserted as text nodes, so question content from JSON can never inject HTML.
 */
import { state } from './state.js';
import { Storage } from './storage.js';
import { clamp, accuracyTone } from './utils.js';

/* ---------- element builder ---------- */

const PROPERTY_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

function append(el, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) child.forEach((c) => append(el, c));
  else if (child instanceof Node) el.appendChild(child);
  else el.appendChild(document.createTextNode(String(child)));
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key === 'style' && typeof val === 'object') {
        for (const [p, v] of Object.entries(val)) (p.startsWith('--') ? el.style.setProperty(p, v) : (el.style[p] = v));
      } else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (PROPERTY_KEYS.has(key)) el[key] = val;
      else el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  children.forEach((c) => append(el, c));
  return el;
}

/* ---------- icons (24×24 stroke icons) ---------- */

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4"/><path d="M12 13v4M8 20h8M10 17h4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  trash: '<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5 5 16.5M12 11.5l7 5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
  inbox: '<path d="M4 13 6.5 5h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
};

export function icon(name, size = 20, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? ICONS.book; // static, trusted markup only
  return svg;
}

/* ---------- theme ---------- */

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.settings.theme = theme;
  Storage.saveSettings(state.settings);
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}
export const toggleTheme = () => setTheme(state.settings.theme === 'light' ? 'dark' : 'light');

/* ---------- toast ---------- */

export function toast(message, type = 'info', ms = 4200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const iconName = { success: 'checkCircle', error: 'xCircle', warn: 'alert', info: 'info' }[type] ?? 'info';
  const el = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' }, icon(iconName, 18), h('span', {}, message));
  root.appendChild(el);
  const remove = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  };
  const t = setTimeout(remove, ms);
  el.addEventListener('click', () => {
    clearTimeout(t);
    remove();
  });
}

/* ---------- modal ---------- */

/**
 * Show a dialog. `actions` = [{ label, value, variant?, icon? }]. Resolves with the clicked action's value,
 * or null when dismissed (Esc / backdrop). Focus is trapped inside while it is open.
 */
export function modal({ title, body, actions, tone = 'default', dismissible = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    let closed = false;

    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.remove();
        previous?.focus?.();
      }, 160);
      resolve(value);
    };

    const buttons = actions.map((a) =>
      h('button', { type: 'button', class: `btn${a.variant ? ` btn-${a.variant}` : ''}`, onClick: () => close(a.value) }, a.icon ? icon(a.icon, 16) : null, a.label),
    );
    const dialog = h(
      'div',
      { class: `modal glass modal-${tone}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('h3', { id: 'modal-title' }, title),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-actions' }, buttons),
    );
    const overlay = h('div', { class: 'modal-overlay', onClick: (e) => e.target === overlay && dismissible && close(null) }, dialog);

    function onKey(e) {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Tab') {
        const f = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    root.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    (buttons.find((b) => /btn-(primary|danger)/.test(b.className)) ?? buttons[buttons.length - 1])?.focus();
  });
}

/** Yes/no confirmation. Resolves true only when the confirm button is pressed. */
export async function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', tone = 'default' }) {
  const body = typeof message === 'string' ? h('p', {}, message) : message;
  const result = await modal({
    title,
    body,
    tone,
    actions: [
      { label: cancelText, value: false },
      { label: confirmText, value: true, variant: tone === 'danger' ? 'danger' : 'primary' },
    ],
  });
  return result === true;
}

/** True while a dialog is open (a dialog that is fading out no longer counts). */
export const isModalOpen = () => Boolean(document.querySelector('#modal-root .modal-overlay:not(.closing)'));

/* ---------- reusable page pieces ---------- */

export function chip(text, tone = 'muted', iconName = null) {
  return h('span', { class: `chip chip-${tone}` }, iconName ? icon(iconName, 13) : null, text);
}

export function pageHeader({ eyebrow, title, subtitle, actions }) {
  return h(
    'header',
    { class: 'page-header' },
    h('div', { class: 'page-header-text' }, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h1', {}, title), subtitle ? h('p', { class: 'subtitle' }, subtitle) : null),
    actions?.length ? h('div', { class: 'page-header-actions' }, actions) : null,
  );
}

export function breadcrumb(items) {
  const nodes = [];
  items.forEach((it, i) => {
    if (i) nodes.push(icon('chevronRight', 14, 'crumb-sep'));
    nodes.push(it.href ? h('a', { href: it.href }, it.label) : h('span', { 'aria-current': 'page' }, it.label));
  });
  return h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, nodes);
}

export function emptyState({ icon: iconName = 'inbox', title, message, actions = [], compact = false }) {
  return h(
    'div',
    { class: `empty-state glass${compact ? ' compact' : ''}` },
    h('div', { class: 'empty-icon' }, icon(iconName, 28)),
    h('h3', {}, title),
    message ? (typeof message === 'string' ? h('p', {}, message) : message) : null,
    actions.length ? h('div', { class: 'empty-actions' }, actions) : null,
  );
}

export function progressBar(value, tone = 'accent') {
  return h('div', { class: `bar bar-${tone}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(value) }, h('div', { class: 'bar-fill', style: { width: `${clamp(value, 0, 100)}%` } }));
}

/** Animated circular progress ring with custom centre content. */
export function ring(value, { size = 120, stroke = 10, tone, children } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const t = tone ?? accuracyTone(value);
  const wrap = h('div', { class: `ring ring-${t}`, style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">` +
    `<circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>` +
    `<circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none" stroke-linecap="round" ` +
    `stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  const fill = wrap.querySelector('.ring-fill');
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.strokeDashoffset = String(c * (1 - clamp(value, 0, 100) / 100)))));
  if (children) wrap.appendChild(h('div', { class: 'ring-center' }, children));
  return wrap;
}

/** Replay the page-enter animation on an element. */
export function replayEnter(el) {
  el.classList.remove('enter');
  void el.offsetWidth;
  el.classList.add('enter');
}
