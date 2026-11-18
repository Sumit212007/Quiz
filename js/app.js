/* app.js — application entry point: boot sequence, route table, global handlers. */
import { state } from './state.js';
import { Storage } from './storage.js';
import { loadBank, emptyBank } from './dataLoader.js';
import { hydrateSession } from './quizEngine.js';
import { toast } from './ui.js';
import { initRouter, renderChrome, leaveGuard, subjectsView, unitsView, modeView } from './navigation.js';
import { renderDashboard, renderHistory, renderQuestionBank } from './dashboard.js';
import { renderQuiz, renderResult } from './quizView.js';
import { renderSettings } from './settings.js';

/** Restore the unfinished quiz (if any) against the freshly loaded question bank. */
function syncSession() {
  const saved = Storage.getActive();
  if (!saved) {
    state.session = null;
    return;
  }
  const restored = hydrateSession(saved, state.bank);
  if (!restored) {
    Storage.clearActive();
    state.session = null;
    toast('Your unfinished quiz could not be restored because its questions are no longer available.', 'warn', 6000);
    return;
  }
  state.session = restored;
  Storage.saveActive(restored);
}

export async function reloadData() {
  try {
    state.bank = await loadBank();
  } catch (err) {
    console.error('[app] loadBank failed', err);
    state.bank = emptyBank(`Unexpected error while loading questions: ${err.message}`);
  }
  syncSession();
  renderChrome();
  return state.bank;
}

const routes = [
  { pattern: /^\/$/, title: 'Dashboard', view: (c) => renderDashboard(c) },
  { pattern: /^\/subjects$/, title: 'Subjects', view: subjectsView },
  { pattern: /^\/subject\/([^/]+)$/, keys: ['sid'], title: 'Units', view: unitsView },
  { pattern: /^\/subject\/([^/]+)\/unit\/([^/]+)$/, keys: ['sid', 'uid'], title: 'Quiz mode', view: modeView },
  { pattern: /^\/quiz$/, title: 'Quiz', view: renderQuiz },
  { pattern: /^\/result\/([^/]+)$/, keys: ['id'], title: 'Result', view: renderResult },
  { pattern: /^\/history$/, title: 'Quiz history', view: renderHistory },
  { pattern: /^\/questions$/, title: 'Question bank', view: renderQuestionBank },
  { pattern: /^\/settings$/, title: 'Settings', view: (c) => renderSettings(c, { reloadData }) },
];

async function main() {
  state.settings = Storage.getSettings();
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  Storage.setErrorHandler((message) => toast(message, 'error', 7000));

  // Pointer-follow highlight used by interactive glass cards.
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.spot');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // Close the mobile drawer when the scrim is tapped.
  document.getElementById('scrim')?.addEventListener('click', () => document.body.classList.remove('drawer-open'));

  window.addEventListener('error', (e) => console.error('[app] uncaught error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('[app] unhandled rejection', e.reason));

  await reloadData();
  document.getElementById('boot')?.remove();
  document.body.classList.add('ready');
  initRouter(routes, { guard: leaveGuard });
}

main().catch((err) => {
  console.error('[app] failed to start', err);
  const view = document.getElementById('view');
  if (view) view.textContent = `The app failed to start: ${err.message}`;
});
