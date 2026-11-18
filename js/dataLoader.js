/* dataLoader.js — reads data/manifest.json, fetches + validates every listed question file,
 * merges files imported through the UI, and returns one normalised "bank".
 *
 * bank = {
 *   subjects: [{ id, name, icon, description, units: [{ id, name, files, questions, status }] }],
 *   questionsById: Map<id, question>,
 *   issues: [{ level: 'error'|'warning'|'info', source, message }],
 *   manifestError, manifestLoaded, fileCount, importedCount, totalQuestions, loadedAt
 * }
 * unit.status: 'ok' | 'empty' | 'missing' | 'invalid'
 */
import { Storage } from './storage.js';
import { norm, slugify, naturalCompare, parseJsonError } from './utils.js';

const MANIFEST_PATH = 'data/manifest.json';

class LoadError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

async function fetchJson(path) {
  const url = new URL(path, document.baseURI).href;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (err) {
    const message =
      window.location.protocol === 'file:'
        ? `Cannot read ${path} because the page was opened directly from disk. Start a local server (for example VS Code "Live Server") and open the page over http://.`
        : `Network error while loading ${path}: ${err.message}`;
    throw new LoadError(message, 'network');
  }
  if (res.status === 404) throw new LoadError(`File not found: ${path}`, 'missing');
  if (!res.ok) throw new LoadError(`Could not load ${path} (HTTP ${res.status}).`, 'http');
  const text = await res.text();
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    throw new LoadError(`${path} is not valid JSON — ${parseJsonError(text, err)}`, 'syntax');
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Validate one raw question. Returns { question | null, errors[], id }. */
function validateQuestion(raw) {
  const errors = [];
  if (!isObj(raw)) return { question: null, errors: ['must be an object'], id: '' };

  const id = nonEmptyString(raw.id) ? raw.id.trim() : Number.isFinite(raw.id) ? String(raw.id) : '';
  if (!id) errors.push('missing or empty "id"');

  const text = nonEmptyString(raw.question) ? raw.question.trim() : '';
  if (!text) errors.push('missing or empty "question" text');

  let options = null;
  if (!isObj(raw.options)) {
    errors.push('"options" must be an object like {"A": "…", "B": "…", "C": "…", "D": "…"}');
  } else {
    const keys = Object.keys(raw.options);
    if (keys.length !== 4) errors.push(`"options" must contain exactly 4 entries (found ${keys.length})`);
    const bad = keys.filter((k) => !nonEmptyString(raw.options[k]) && !Number.isFinite(raw.options[k]));
    if (bad.length) errors.push(`option ${bad.join(', ')} must be non-empty text`);
    if (keys.length === 4 && !bad.length) {
      options = Object.fromEntries(keys.map((k) => [k.trim(), String(raw.options[k]).trim()]));
      if (Object.keys(options).length !== 4) {
        errors.push('option keys must be unique');
        options = null;
      }
    }
  }

  let correctAnswer = null;
  if (!nonEmptyString(raw.correctAnswer)) {
    errors.push('missing "correctAnswer"');
  } else if (options) {
    const wanted = raw.correctAnswer.trim();
    const keys = Object.keys(options);
    const loose = keys.filter((k) => k.toUpperCase() === wanted.toUpperCase());
    correctAnswer = keys.includes(wanted) ? wanted : loose.length === 1 ? loose[0] : null;
    if (!correctAnswer) errors.push(`"correctAnswer" is "${wanted}" but the option keys are ${keys.join(', ')}`);
  }

  if (errors.length) return { question: null, errors, id };
  return {
    question: {
      id,
      question: text,
      options,
      correctAnswer,
      explanation: typeof raw.explanation === 'string' ? raw.explanation.trim() : '',
    },
    errors,
    id,
  };
}

/**
 * Validate a list of raw questions, skipping invalid or duplicate ones.
 * `seen` is the global id → question map (this is what guarantees unique ids across the whole app).
 */
function checkQuestions(rawList, label, sourceTag, seen, place) {
  const questions = [];
  const problems = [];
  rawList.forEach((raw, i) => {
    const r = validateQuestion(raw);
    const where = `${label} → question #${i + 1}${r.id ? ` ("${r.id}")` : ''}`;
    if (!r.question) {
      problems.push({ level: 'error', message: `${where}: ${r.errors.join('; ')}. Question skipped.` });
      return;
    }
    const prior = seen.get(r.question.id);
    if (prior) {
      problems.push({
        level: 'warning',
        message: `${where}: duplicate id — already used by ${prior.sourceLabel}. Question skipped.`,
      });
      return;
    }
    const full = {
      ...r.question,
      subjectId: place.subject.id,
      subjectName: place.subject.name,
      unitId: place.unit.id,
      unitName: place.unit.name,
      source: sourceTag,
      sourceLabel: label,
    };
    seen.set(full.id, full);
    questions.push(full);
  });
  return { questions, problems };
}

/* ------------------------------------------------------------------ */
/* Manifest → structure                                                */
/* ------------------------------------------------------------------ */

function normalizePath(p) {
  const clean = p.trim().replace(/^\.?\//, '');
  return clean.startsWith('data/') ? clean : `data/${clean}`;
}

function buildStructure(manifest, subjects, issues, tasks) {
  if (!isObj(manifest) || !Array.isArray(manifest.subjects)) {
    issues.push({ level: 'error', source: MANIFEST_PATH, message: 'manifest.json must be an object with a "subjects" array.' });
    return;
  }
  const subjectKeys = new Set();
  manifest.subjects.forEach((ms, si) => {
    const where = `${MANIFEST_PATH} → subjects[${si}]`;
    if (!isObj(ms) || !nonEmptyString(ms.name)) {
      issues.push({ level: 'error', source: where, message: 'Each subject needs a non-empty "name".' });
      return;
    }
    const id = nonEmptyString(ms.id) ? ms.id.trim() : slugify(ms.name);
    if (subjectKeys.has(norm(id))) {
      issues.push({ level: 'error', source: where, message: `Duplicate subject id "${id}". Entry skipped.` });
      return;
    }
    subjectKeys.add(norm(id));
    const subject = {
      id,
      name: ms.name.trim(),
      description: typeof ms.description === 'string' ? ms.description : '',
      icon: typeof ms.icon === 'string' ? ms.icon : 'book',
      units: [],
      source: 'manifest',
    };
    subjects.push(subject);

    if (!Array.isArray(ms.units)) {
      issues.push({ level: 'warning', source: where, message: `Subject "${subject.name}" has no "units" array.` });
      return;
    }
    const unitKeys = new Set();
    ms.units.forEach((mu, ui) => {
      const uwhere = `${where}.units[${ui}]`;
      if (!isObj(mu) || !nonEmptyString(mu.name)) {
        issues.push({ level: 'error', source: uwhere, message: 'Each unit needs a non-empty "name".' });
        return;
      }
      const uid = nonEmptyString(mu.id) ? mu.id.trim() : slugify(mu.name);
      if (unitKeys.has(norm(uid))) {
        issues.push({ level: 'error', source: uwhere, message: `Duplicate unit id "${uid}" in ${subject.name}. Entry skipped.` });
        return;
      }
      unitKeys.add(norm(uid));
      const rawFiles = Array.isArray(mu.files) ? mu.files : mu.file ? [mu.file] : [];
      const files = rawFiles.filter(nonEmptyString).map(normalizePath);
      const unit = { id: uid, name: mu.name.trim(), files, questions: [], status: 'empty', source: 'manifest' };
      subject.units.push(unit);
      if (!files.length) {
        issues.push({ level: 'warning', source: uwhere, message: `Unit "${unit.name}" has no "file" in manifest.json.` });
      }
      files.forEach((path) => {
        if (/^[a-z]+:\/\//i.test(path) || path.includes('..')) {
          issues.push({ level: 'error', source: uwhere, message: `File path "${path}" must be relative to the data folder.` });
          return;
        }
        tasks.push({ subject, unit, path });
      });
    });
  });
}

/** Find (or create) the subject/unit an imported file belongs to. */
function place(subjects, subjectName, unitName) {
  let subject = subjects.find((s) => norm(s.id) === norm(subjectName) || norm(s.name) === norm(subjectName));
  if (!subject) {
    let id = slugify(subjectName);
    while (subjects.some((s) => s.id === id)) id += '-x';
    subject = { id, name: subjectName.trim(), description: 'Added from an imported file.', icon: 'book', units: [], source: 'import' };
    subjects.push(subject);
  }
  let unit = subject.units.find((u) => norm(u.id) === norm(unitName) || norm(u.name) === norm(unitName));
  if (!unit) {
    let id = slugify(unitName);
    while (subject.units.some((u) => u.id === id)) id += '-x';
    unit = { id, name: unitName.trim(), files: [], questions: [], status: 'empty', source: 'import' };
    subject.units.push(unit);
    if (subject.source === 'import') subject.units.sort((a, b) => naturalCompare(a.name, b.name));
  }
  return { subject, unit };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function loadBank() {
  const issues = [];
  const subjects = [];
  const questionsById = new Map();
  const bank = {
    subjects,
    questionsById,
    issues,
    manifestError: null,
    manifestLoaded: false,
    fileCount: 0,
    importedCount: 0,
    totalQuestions: 0,
    loadedAt: new Date().toISOString(),
  };

  // 1. Manifest
  const tasks = [];
  try {
    const manifest = await fetchJson(MANIFEST_PATH);
    bank.manifestLoaded = true;
    buildStructure(manifest, subjects, issues, tasks);
  } catch (err) {
    bank.manifestError = err.message;
    issues.push({ level: 'error', source: MANIFEST_PATH, message: err.message });
  }

  // 2. Every listed file, fetched in parallel, processed in manifest order (deterministic de-duplication)
  await Promise.all(
    tasks.map(async (t) => {
      try {
        t.data = await fetchJson(t.path);
      } catch (err) {
        t.error = err;
      }
    }),
  );

  for (const t of tasks) {
    const { subject, unit, path } = t;
    bank.fileCount++;
    const fail = (kind) => {
      if (!unit.questions.length) unit.status = kind;
    };
    if (t.error) {
      const missing = t.error.kind === 'missing';
      issues.push({
        level: missing ? 'warning' : 'error',
        source: path,
        message: missing ? `${t.error.message}. It is listed in manifest.json — create the file or remove the entry.` : t.error.message,
      });
      fail(missing ? 'missing' : 'invalid');
      continue;
    }
    const data = t.data;
    if (!isObj(data) || !Array.isArray(data.questions)) {
      issues.push({ level: 'error', source: path, message: 'Expected an object with a "questions" array.' });
      fail('invalid');
      continue;
    }
    if (
      (nonEmptyString(data.subject) && norm(data.subject) !== norm(subject.name) && norm(data.subject) !== norm(subject.id)) ||
      (nonEmptyString(data.unit) && norm(data.unit) !== norm(unit.name) && norm(data.unit) !== norm(unit.id))
    ) {
      issues.push({
        level: 'warning',
        source: path,
        message: `File says "${data.subject} / ${data.unit}" but manifest.json lists it under "${subject.name} / ${unit.name}". The manifest placement is used.`,
      });
    }
    const { questions, problems } = checkQuestions(data.questions, path, `file:${path}`, questionsById, { subject, unit });
    problems.forEach((p) => issues.push({ ...p, source: path }));
    unit.questions.push(...questions);
    unit.status = unit.questions.length ? 'ok' : problems.length ? 'invalid' : 'empty';
  }

  // 3. Files imported through the UI (stored in localStorage)
  for (const imp of Storage.getImported()) {
    bank.importedCount++;
    const label = `imported file "${imp.name}"`;
    const data = imp?.data;
    if (!isObj(data) || !nonEmptyString(data.subject) || !nonEmptyString(data.unit) || !Array.isArray(data.questions)) {
      issues.push({ level: 'error', source: label, message: 'Stored import is malformed and was ignored. Remove it in Settings.' });
      continue;
    }
    const placement = place(subjects, data.subject, data.unit);
    const { questions, problems } = checkQuestions(data.questions, label, `import:${imp.name}`, questionsById, placement);
    problems.forEach((p) => issues.push({ ...p, source: label }));
    placement.unit.questions.push(...questions);
    if (placement.unit.questions.length) placement.unit.status = 'ok';
  }

  bank.totalQuestions = questionsById.size;
  return bank;
}

export function emptyBank(message) {
  return {
    subjects: [],
    questionsById: new Map(),
    issues: [{ level: 'error', source: 'application', message }],
    manifestError: message,
    manifestLoaded: false,
    fileCount: 0,
    importedCount: 0,
    totalQuestions: 0,
    loadedAt: new Date().toISOString(),
  };
}

export const getSubject = (bank, id) => bank.subjects.find((s) => s.id === id) ?? null;
export const getUnit = (bank, subjectId, unitId) =>
  getSubject(bank, subjectId)?.units.find((u) => u.id === unitId) ?? null;

/* ---------- JSON import (used by Settings) ---------- */

/**
 * Validate the text of a user-selected file WITHOUT saving anything.
 * Returns { ok, fileName, fatal?, accepted, problems, cleaned?, replaced? }.
 */
export function prepareImport(fileName, text, bank) {
  const fail = (fatal, problems = []) => ({ ok: false, fileName, fatal, accepted: 0, problems });
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    return fail(`Not valid JSON — ${parseJsonError(text, err)}`);
  }
  if (!isObj(data)) return fail('The top level must be an object with "subject", "unit" and "questions".');
  if (!nonEmptyString(data.subject)) return fail('Missing "subject" (for example "Computer Networking").');
  if (!nonEmptyString(data.unit)) return fail('Missing "unit" (for example "Unit 3").');
  if (!Array.isArray(data.questions)) return fail('Missing "questions" array.');

  const sourceTag = `import:${fileName}`;
  // Ignore questions that came from a previous import of this same file name — re-importing replaces it.
  const seen = new Map([...bank.questionsById].filter(([, q]) => q.source !== sourceTag));
  const dummy = { subject: { id: '', name: data.subject.trim() }, unit: { id: '', name: data.unit.trim() } };
  const { questions, problems } = checkQuestions(data.questions, fileName, sourceTag, seen, dummy);
  if (!questions.length) {
    return fail(data.questions.length ? 'No valid questions were found in this file.' : 'The "questions" array is empty.', problems);
  }
  return {
    ok: true,
    fileName,
    accepted: questions.length,
    problems,
    replaced: Storage.getImported().some((f) => f.name === fileName),
    cleaned: {
      subject: data.subject.trim(),
      unit: data.unit.trim(),
      questions: questions.map(({ id, question, options, correctAnswer, explanation }) => ({ id, question, options, correctAnswer, explanation })),
    },
  };
}

export function commitImport(fileName, cleaned) {
  const list = Storage.getImported().filter((f) => f.name !== fileName);
  list.push({ name: fileName, importedAt: new Date().toISOString(), data: cleaned });
  return Storage.saveImported(list);
}

export function removeImport(fileName) {
  return Storage.saveImported(Storage.getImported().filter((f) => f.name !== fileName));
}

export function clearImports() {
  return Storage.saveImported([]);
}
