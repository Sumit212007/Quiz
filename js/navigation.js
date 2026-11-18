/* navigation.js — hash router, sidebar/top bar, and the three "selection" pages:
 *   Subjects  →  Units  →  Quiz mode   (then startQuiz() opens the quiz).
 */
import { state } from './state.js';
import { Storage } from './storage.js';
import { getSubject, getUnit } from './dataLoader.js';
import { categorize, questionsForMode } from './progress.js';
import { createSession, MODES } from './quizEngine.js';
import {
  h, icon, toast, modal, confirmDialog, chip, pageHeader, breadcrumb, emptyState, progressBar, toggleTheme, replayEnter,
} from './ui.js';
import { plural, pct } from './utils.js';

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

let routes = [];
let guard = null;
let currentRoute = null;
let cleanup = null;

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path, query: new URLSearchParams(query), raw: path + (query ? `?${query}` : '') };
}

export function navigate(path) {
  const target = `#${path}`;
  if (window.location.hash === target) render(parseHash());
  else window.location.hash = target;
}

function render(route) {
  const view = document.getElementById('view');
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error('[router] cleanup failed', err); }
  }
  cleanup = null;
  currentRoute = route;

  let matched = null;
  let params = {};
  for (const r of routes) {
    const m = route.path.match(r.pattern);
    if (m) {
      matched = r;
      (r.keys ?? []).forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      break;
    }
  }

  view.replaceChildren();
  replayEnter(view);
  window.scrollTo({ top: 0 });
  document.body.classList.remove('drawer-open');

  if (!matched) {
    document.title = 'Not found · MCQ Practice Studio';
    view.append(emptyState({ icon: 'search', title: 'Page not found', message: 'That page does not exist.', actions: [h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to dashboard')] }));
  } else {
    document.title = `${matched.title} · MCQ Practice Studio`;
    try {
      cleanup = matched.view(view, params, route.query) ?? null;
    } catch (err) {
      console.error('[router] view failed', err);
      view.replaceChildren(emptyState({ icon: 'alert', title: 'Something went wrong', message: `This page could not be displayed: ${err.message}`, actions: [h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to dashboard')] }));
    }
  }
  renderChrome();
  view.focus({ preventScroll: true });
}

async function onHashChange() {
  const to = parseHash();
  if (currentRoute && guard) {
    const allowed = await guard(currentRoute, to);
    if (!allowed) {
      // Put the address bar back without triggering another navigation.
      history.replaceState(null, '', `#${currentRoute.raw}`);
      return;
    }
  }
  render(to);
}

export function initRouter(routeTable, { guard: guardFn } = {}) {
  routes = routeTable;
  guard = guardFn ?? null;
  window.addEventListener('hashchange', onHashChange);
  render(parseHash());
}

/** Ask before leaving an unfinished quiz (progress is saved either way). */
export async function leaveGuard(from, to) {
  if (from.path === '/quiz' && state.session && to.path !== '/quiz') {
    return confirmDialog({
      title: 'Leave this quiz?',
      message: 'Your answers and timer are saved. You can pick the quiz up again from the dashboard or the sidebar.',
      confirmText: 'Leave quiz',
      cancelText: 'Stay here',
    });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Sidebar + top bar                                                   */
/* ------------------------------------------------------------------ */

const NAV = [
  { label: 'Dashboard', icon: 'home', href: '#/', match: (p) => p === '/' },
  { label: 'Subjects', icon: 'grid', href: '#/subjects', match: (p) => p.startsWith('/subject') },
  { label: 'Question Bank', icon: 'list', href: '#/questions', match: (p) => p === '/questions' },
  { label: 'History', icon: 'history', href: '#/history', match: (p) => p === '/history' || p.startsWith('/result') },
  { label: 'Settings', icon: 'sliders', href: '#/settings', match: (p) => p === '/settings' },
];

function themeButton(cls = 'nav-link nav-button') {
  return h(
    'button',
    { type: 'button', class: `${cls} theme-toggle`, 'aria-label': 'Toggle dark / light theme', onClick: toggleTheme },
    h('span', { class: 'when-dark' }, icon('sun', 20)),
    h('span', { class: 'when-light' }, icon('moon', 20)),
    h('span', { class: 'nav-label' }, h('span', { class: 'when-dark' }, 'Light mode'), h('span', { class: 'when-light' }, 'Dark mode')),
  );
}

export function renderChrome() {
  const path = currentRoute?.path ?? parseHash().path;
  const sidebar = document.getElementById('sidebar');
  const topbar = document.getElementById('topbar');
  if (!sidebar || !topbar) return;

  const links = NAV.map((n) =>
    h('a', { class: `nav-link${n.match(path) ? ' active' : ''}`, href: n.href, 'aria-current': n.match(path) ? 'page' : null }, icon(n.icon, 20), h('span', { class: 'nav-label' }, n.label)),
  );
  if (state.session) {
    links.splice(
      2,
      0,
      h('a', { class: `nav-link resume${path === '/quiz' ? ' active' : ''}`, href: '#/quiz' }, icon('play', 20), h('span', { class: 'nav-label' }, 'Resume quiz'), h('span', { class: 'pulse-dot', 'aria-hidden': 'true' })),
    );
  }

  sidebar.replaceChildren(
    h('a', { class: 'brand', href: '#/', 'aria-label': 'MCQ Practice Studio home' }, h('span', { class: 'brand-mark' }, icon('sparkle', 20)), h('span', { class: 'brand-text' }, h('strong', {}, 'MCQ Studio'), h('small', {}, 'Practice & revision'))),
    h('nav', { class: 'nav', 'aria-label': 'Main' }, links),
    h('div', { class: 'sidebar-foot' }, !Storage.isPersistent ? h('div', { class: 'storage-warn', title: 'Browser storage is blocked, progress will be lost when you close this tab.' }, icon('alert', 16), h('span', { class: 'nav-label' }, 'Progress not saved')) : null, themeButton()),
  );

  topbar.replaceChildren(
    h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Open menu', onClick: () => document.body.classList.toggle('drawer-open') }, icon('menu', 20)),
    h('a', { class: 'brand brand-compact', href: '#/' }, h('span', { class: 'brand-mark' }, icon('sparkle', 18)), h('strong', {}, 'MCQ Studio')),
    themeButton('btn btn-icon'),
  );
}

/* ------------------------------------------------------------------ */
/* Starting a quiz                                                     */
/* ------------------------------------------------------------------ */

export async function startQuiz(subjectId, unitId, mode) {
  const { bank, settings } = state;
  const subject = getSubject(bank, subjectId);
  const unit = getUnit(bank, subjectId, unitId);
  if (!subject || !unit) {
    toast('That subject or unit is no longer available.', 'error');
    return;
  }
  const pool = questionsForMode(unit.questions, Storage.getQStatus(), mode);
  if (!pool.length) {
    toast('There are no questions available for this mode yet.', 'warn');
    return;
  }

  if (state.session) {
    const s = state.session;
    const answered = Object.keys(s.answers).length;
    const choice = await modal({
      title: 'You have an unfinished quiz',
      body: h('p', {}, `${s.subjectName} · ${s.unitName} (${MODES[s.mode]?.label ?? s.mode}) — ${answered} of ${s.items.length} answered. Starting a new quiz will discard it.`),
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Resume it', value: 'resume', variant: 'primary' },
        { label: 'Discard & start new', value: 'new', variant: 'danger' },
      ],
    });
    if (choice === 'resume') return navigate('/quiz');
    if (choice !== 'new') return;
    Storage.clearActive();
    state.session = null;
  }

  const session = createSession({ subject, unit, mode, questions: pool, settings, length: settings.quizLength });
  state.session = session;
  Storage.saveActive(session);
  navigate('/quiz');
}

/* ------------------------------------------------------------------ */
/* Selection pages                                                     */
/* ------------------------------------------------------------------ */

function noDataState() {
  const { bank } = state;
  return emptyState({
    icon: 'inbox',
    title: bank.manifestError ? 'Question files could not be loaded' : 'No subjects found',
    message: bank.manifestError ?? 'Add subjects to data/manifest.json, or import a question file from Settings.',
    actions: [h('a', { class: 'btn btn-primary', href: '#/settings' }, icon('sliders', 16), 'Open Settings & Import')],
  });
}

export function subjectsView(container) {
  const { bank } = state;
  const qstatus = Storage.getQStatus();
  container.append(pageHeader({ eyebrow: 'Step 1 of 3', title: 'Choose a subject', subtitle: 'Pick the subject you want to practise today.' }));

  if (!bank.subjects.length) return container.append(noDataState());

  const cards = bank.subjects.map((subject) => {
    const all = subject.units.flatMap((u) => u.questions);
    const mastered = all.filter((q) => qstatus[q.id]?.everCorrect).length;
    const empty = all.length === 0;
    return h(
      'a',
      { class: 'glass card card-hover spot subject-card', href: `#/subject/${encodeURIComponent(subject.id)}` },
      h('div', { class: 'card-top' }, h('span', { class: 'icon-bubble' }, icon(subject.icon, 26)), empty ? chip('No questions yet', 'warn') : chip(`${pct(mastered, all.length).toFixed(0)}% mastered`, 'accent')),
      h('h3', {}, subject.name),
      h('p', { class: 'muted' }, subject.description || 'Practice questions for this subject.'),
      progressBar(pct(mastered, all.length)),
      h('div', { class: 'card-meta' }, h('span', {}, plural(subject.units.length, 'unit')), h('span', {}, plural(all.length, 'question')), h('span', { class: 'card-go' }, 'Open', icon('arrowRight', 16))),
    );
  });
  container.append(h('div', { class: 'cards-grid' }, cards));
}

export function unitsView(container, { sid }) {
  const { bank } = state;
  const subject = getSubject(bank, sid);
  if (!subject) {
    return container.append(emptyState({ icon: 'search', title: 'Subject not found', message: 'This subject is not in your question bank.', actions: [h('a', { class: 'btn btn-primary', href: '#/subjects' }, 'Back to subjects')] }));
  }
  const qstatus = Storage.getQStatus();
  const total = subject.units.reduce((n, u) => n + u.questions.length, 0);

  container.append(
    breadcrumb([{ label: 'Subjects', href: '#/subjects' }, { label: subject.name }]),
    pageHeader({ eyebrow: 'Step 2 of 3', title: subject.name, subtitle: 'Choose a unit to practise.' }),
  );
  if (total === 0) {
    container.append(emptyState({ compact: true, icon: 'inbox', title: 'No questions in this subject yet', message: 'Add question files to the manifest, or import a JSON file from Settings. See the README for the format.', actions: [h('a', { class: 'btn btn-primary', href: '#/settings' }, icon('upload', 16), 'Import questions')] }));
  }

  const cards = subject.units.map((unit) => {
    const c = categorize(unit.questions, qstatus);
    const n = unit.questions.length;
    const statusChip =
      unit.status === 'missing' ? chip('File not found', 'warn') : unit.status === 'invalid' && !n ? chip('Has errors', 'danger') : n === 0 ? chip('No questions yet', 'muted') : chip(`${pct(c.correct.length, n).toFixed(0)}% mastered`, 'accent');
    return h(
      'a',
      { class: 'glass card card-hover spot unit-card', href: `#/subject/${encodeURIComponent(subject.id)}/unit/${encodeURIComponent(unit.id)}` },
      h('div', { class: 'card-top' }, h('span', { class: 'unit-badge' }, unit.name.replace(/^unit\s*/i, '') || '•'), statusChip),
      h('h3', {}, unit.name),
      h('p', { class: 'muted' }, plural(n, 'question')),
      progressBar(pct(c.correct.length, n)),
      h('div', { class: 'mini-stats' }, h('span', {}, h('b', {}, c.fresh.length), ' fresh'), h('span', {}, h('b', {}, c.correct.length), ' correct'), h('span', {}, h('b', {}, c.wrong.length), ' to review')),
      h('div', { class: 'card-meta' }, h('span', { class: 'card-go' }, 'Choose mode', icon('arrowRight', 16))),
    );
  });
  container.append(h('div', { class: 'cards-grid' }, cards));
}

const EMPTY_MODE_MESSAGES = {
  fresh: 'You have answered every question here correctly. Try the Correct Answer Quiz to keep them sharp.',
  correct: 'Nothing here yet. Questions you answer correctly in a quiz will show up here.',
  wrong: 'No mistakes to review. Questions you answer incorrectly will show up here.',
};

export function modeView(container, { sid, uid }) {
  const { bank } = state;
  const subject = getSubject(bank, sid);
  const unit = getUnit(bank, sid, uid);
  if (!subject || !unit) {
    return container.append(emptyState({ icon: 'search', title: 'Unit not found', message: 'This unit is not in your question bank.', actions: [h('a', { class: 'btn btn-primary', href: '#/subjects' }, 'Back to subjects')] }));
  }

  container.append(
    breadcrumb([{ label: 'Subjects', href: '#/subjects' }, { label: subject.name, href: `#/subject/${encodeURIComponent(subject.id)}` }, { label: unit.name }]),
    pageHeader({ eyebrow: 'Step 3 of 3', title: `${subject.name} · ${unit.name}`, subtitle: 'Choose how you want to practise.' }),
  );

  if (!unit.questions.length) {
    const reasons = {
      missing: { title: 'Question file not found', message: `manifest.json lists ${unit.files.join(', ') || 'a file'} for this unit, but it does not exist yet. Create the file or import one from Settings.` },
      invalid: { title: 'This unit’s file has errors', message: 'None of its questions passed validation. Open Settings → Data health to see exactly what to fix.' },
      empty: { title: 'No questions in this unit yet', message: 'Add questions to the unit’s JSON file (then reload), or import a JSON file from Settings.' },
    };
    const r = reasons[unit.status] ?? reasons.empty;
    return container.append(emptyState({ icon: 'inbox', title: r.title, message: r.message, actions: [h('a', { class: 'btn btn-primary', href: '#/settings' }, icon('upload', 16), 'Import / data health'), h('a', { class: 'btn', href: `#/subject/${encodeURIComponent(subject.id)}` }, 'Back to units')] }));
  }

  const qstatus = Storage.getQStatus();
  const cats = categorize(unit.questions, qstatus);
  const lengths = ['all', 10, 20, 30, 50];

  const lengthHost = h('div', { class: 'seg', role: 'group', 'aria-label': 'Questions per quiz' });
  const modesHost = h('div', { class: 'modes-grid' });

  const effective = (n) => (state.settings.quizLength === 'all' ? n : Math.min(n, Number(state.settings.quizLength)));

  function renderLength() {
    lengthHost.replaceChildren(
      ...lengths.map((l) =>
        h('button', {
          type: 'button',
          class: `seg-btn${String(state.settings.quizLength) === String(l) ? ' active' : ''}`,
          onClick: () => {
            state.settings.quizLength = l;
            Storage.saveSettings(state.settings);
            renderLength();
            renderModes();
          },
        }, l === 'all' ? 'All' : String(l)),
      ),
    );
  }

  function renderModes() {
    modesHost.replaceChildren(
      ...Object.values(MODES).map((mode) => {
        const pool = cats[mode.id];
        const count = pool.length;
        const disabled = count === 0;
        return h(
          'div',
          { class: `glass card mode-card mode-${mode.id}${disabled ? ' is-empty' : ' card-hover spot'}` },
          h('div', { class: 'card-top' }, h('span', { class: 'icon-bubble' }, icon(mode.icon, 26)), chip(plural(count, 'question'), disabled ? 'muted' : 'accent')),
          h('h3', {}, mode.label),
          h('p', { class: 'muted' }, mode.description),
          disabled
            ? h('div', { class: 'mode-empty' }, icon('info', 16), h('span', {}, EMPTY_MODE_MESSAGES[mode.id]))
            : h('div', { class: 'mode-count' }, `This quiz: ${plural(effective(count), 'question')}`),
          h('button', { type: 'button', class: 'btn btn-primary', disabled, 'data-mode': mode.id, onClick: () => startQuiz(subject.id, unit.id, mode.id) }, icon('play', 16), 'Start quiz'),
        );
      }),
    );
  }

  renderLength();
  renderModes();
  container.append(
    h('div', { class: 'length-row glass' }, h('div', {}, h('strong', {}, 'Questions per quiz'), h('p', { class: 'muted' }, 'Order and answer options are shuffled every time.')), lengthHost),
    modesHost,
  );
}
