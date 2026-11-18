/* storage.js — the ONLY module that touches localStorage.
 * Falls back to an in-memory store when localStorage is blocked (e.g. some private modes),
 * and keeps a backup copy of any record that can no longer be parsed.
 */

const KEYS = {
  settings: 'mcq.settings.v1',
  history: 'mcq.history.v1',
  qstatus: 'mcq.questionStatus.v1',
  active: 'mcq.activeQuiz.v1',
  imported: 'mcq.importedFiles.v1',
};

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  shuffleQuestions: true,
  shuffleOptions: true,
  quizLength: 'all',
};

const memory = new Map();
let errorHandler = () => {};

function probe() {
  try {
    const k = '__mcq_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
const persistent = probe();

function read(key, fallback) {
  let raw = null;
  try {
    raw = persistent ? window.localStorage.getItem(key) : memory.get(key) ?? null;
  } catch {
    return fallback;
  }
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] "${key}" is corrupted and was reset.`, err);
    try {
      if (persistent) window.localStorage.setItem(`${key}.corrupt`, raw);
    } catch { /* ignore */ }
    errorHandler(`Saved data "${key}" was unreadable and has been reset (a backup copy was kept).`);
    return fallback;
  }
}

function write(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (persistent) window.localStorage.setItem(key, raw);
    else memory.set(key, raw);
    return true;
  } catch (err) {
    console.error(`[storage] Could not save "${key}"`, err);
    errorHandler('Could not save your data — browser storage may be full or blocked.');
    return false;
  }
}

function remove(key) {
  try {
    if (persistent) window.localStorage.removeItem(key);
    else memory.delete(key);
  } catch { /* ignore */ }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const Storage = {
  get isPersistent() {
    return persistent;
  },
  setErrorHandler(fn) {
    errorHandler = typeof fn === 'function' ? fn : () => {};
  },

  getSettings() {
    const s = read(KEYS.settings, {});
    return { ...DEFAULT_SETTINGS, ...(isPlainObject(s) ? s : {}) };
  },
  saveSettings(settings) {
    return write(KEYS.settings, settings);
  },

  getHistory() {
    const h = read(KEYS.history, []);
    return Array.isArray(h) ? h : [];
  },
  saveHistory(list) {
    return write(KEYS.history, list);
  },

  /** { [questionId]: { latest, everCorrect, attempts, correct, wrong, lastAt } } */
  getQStatus() {
    const s = read(KEYS.qstatus, {});
    return isPlainObject(s) ? s : {};
  },
  saveQStatus(map) {
    return write(KEYS.qstatus, map);
  },

  getActive() {
    const a = read(KEYS.active, null);
    return isPlainObject(a) ? a : null;
  },
  saveActive(session) {
    return write(KEYS.active, session);
  },
  clearActive() {
    remove(KEYS.active);
  },

  getImported() {
    const i = read(KEYS.imported, []);
    return Array.isArray(i) ? i : [];
  },
  saveImported(list) {
    return write(KEYS.imported, list);
  },

  /** Wipe quiz history, per-question status and any unfinished quiz. Keeps settings and imported files. */
  clearProgress() {
    remove(KEYS.history);
    remove(KEYS.qstatus);
    remove(KEYS.active);
  },
};
