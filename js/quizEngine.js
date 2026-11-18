/* quizEngine.js — pure quiz logic: building a session, restoring it, scoring it, and the timer.
 * No DOM access here.
 *
 * session = {
 *   version, sessionId, subjectId, subjectName, unitId, unitName, mode,
 *   items:   [{ id, order: ['C','A','D','B'] }]   // question ids + the option-key order shown to the user
 *   answers: { [questionId]: 'A' }                // ORIGINAL option key chosen (stable even when options are shuffled)
 *   currentIndex, startedAt, elapsed
 * }
 */
import { shuffle, uid, clamp } from './utils.js';

export const MODES = {
  fresh: {
    id: 'fresh',
    label: 'Fresh Quiz',
    icon: 'sparkle',
    description: 'Questions you have not answered correctly yet — new ones and past mistakes.',
  },
  correct: {
    id: 'correct',
    label: 'Correct Answer Quiz',
    icon: 'checkCircle',
    description: 'Revisit questions you have answered correctly before and keep them sharp.',
  },
  wrong: {
    id: 'wrong',
    label: 'Wrong Answer Quiz',
    icon: 'xCircle',
    description: 'Practise the questions you most recently got wrong until they stick.',
  },
};

export function createSession({ subject, unit, mode, questions, settings, length }) {
  let pool = settings.shuffleQuestions ? shuffle(questions) : [...questions];
  const n = Number(length);
  if (length !== 'all' && Number.isFinite(n) && n > 0 && n < pool.length) pool = pool.slice(0, n);

  return {
    version: 1,
    sessionId: uid('ses'),
    subjectId: subject.id,
    subjectName: subject.name,
    unitId: unit.id,
    unitName: unit.name,
    mode,
    items: pool.map((q) => {
      const keys = Object.keys(q.options);
      return { id: q.id, order: settings.shuffleOptions ? shuffle(keys) : keys };
    }),
    answers: {},
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    elapsed: 0,
  };
}

/**
 * Re-attach a saved session to the current bank. Questions that no longer exist are dropped,
 * and option orders that no longer match the question are repaired. Returns null if nothing is left.
 */
export function hydrateSession(session, bank) {
  if (!session || session.version !== 1 || !Array.isArray(session.items)) return null;
  session.answers = session.answers && typeof session.answers === 'object' ? session.answers : {};
  const items = [];
  for (const it of session.items) {
    const q = bank.questionsById.get(it?.id);
    if (!q) {
      delete session.answers[it?.id];
      continue;
    }
    const keys = Object.keys(q.options);
    const validOrder = Array.isArray(it.order) && it.order.length === keys.length && keys.every((k) => it.order.includes(k));
    items.push({ id: it.id, order: validOrder ? it.order : keys });
    if (session.answers[it.id] && !keys.includes(session.answers[it.id])) delete session.answers[it.id];
  }
  if (!items.length) return null;
  session.items = items;
  session.currentIndex = clamp(Number(session.currentIndex) || 0, 0, items.length - 1);
  session.elapsed = Number(session.elapsed) || 0;
  return session;
}

/** Turn a finished session into an attempt record (without its id). +1 per correct answer, 0 otherwise. */
export function scoreSession(session, bank, elapsedSeconds) {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const responses = session.items.map((it) => {
    const q = bank.questionsById.get(it.id);
    const selected = session.answers[it.id] ?? null;
    let isCorrect = null;
    if (selected == null) unanswered++;
    else if (selected === q.correctAnswer) {
      isCorrect = true;
      correct++;
    } else {
      isCorrect = false;
      wrong++;
    }
    return { id: it.id, selected, correct: q.correctAnswer, order: it.order, isCorrect };
  });
  const total = session.items.length;
  return {
    subjectId: session.subjectId,
    subjectName: session.subjectName,
    unitId: session.unitId,
    unitName: session.unitName,
    mode: session.mode,
    score: correct,
    total,
    correct,
    wrong,
    unanswered,
    accuracy: total ? Math.round((correct / total) * 10000) / 100 : 0,
    timeTaken: Math.round(elapsedSeconds),
    startedAt: session.startedAt,
    completedAt: new Date().toISOString(),
    responses,
  };
}

/** Count-up timer that can resume from a saved number of seconds. */
export class QuizTimer {
  constructor(initialSeconds = 0, onTick = null) {
    this.base = initialSeconds;
    this.mark = null;
    this.handle = null;
    this.onTick = onTick;
  }
  start() {
    if (this.handle) return;
    this.mark = performance.now();
    this.handle = setInterval(() => this.onTick?.(this.elapsed()), 250);
    this.onTick?.(this.elapsed());
  }
  elapsed() {
    return this.base + (this.mark != null ? (performance.now() - this.mark) / 1000 : 0);
  }
  stop() {
    const e = this.elapsed();
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
    this.mark = null;
    this.base = e;
    return e;
  }
}
