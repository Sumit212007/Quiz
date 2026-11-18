/* progress.js — everything about remembering and summarising what the user has done.
 *
 * Per-question status is keyed by QUESTION ID (never by position):
 *   { latest: 'correct'|'wrong', everCorrect: boolean, attempts, correct, wrong, lastAt }
 *
 * Mode membership:
 *   fresh   → questions never answered correctly          (!everCorrect)
 *   correct → questions answered correctly at least once  (everCorrect; stays even if later missed)
 *   wrong   → questions whose latest answer was wrong     (latest === 'wrong'; leaves when answered correctly)
 */
import { Storage } from './storage.js';
import { uid, pct, downloadJSON } from './utils.js';

export function categorize(questions, qstatus = Storage.getQStatus()) {
  const fresh = [];
  const correct = [];
  const wrong = [];
  for (const q of questions) {
    const s = qstatus[q.id];
    if (!s?.everCorrect) fresh.push(q);
    if (s?.everCorrect) correct.push(q);
    if (s?.latest === 'wrong') wrong.push(q);
  }
  return { fresh, correct, wrong };
}

export function questionsForMode(questions, qstatus, mode) {
  const c = categorize(questions, qstatus);
  return c[mode] ?? [];
}

/** Persist a finished quiz and update the per-question status map. Returns the saved attempt. */
export function recordAttempt(attempt) {
  const saved = { ...attempt, id: uid('att') };
  const history = Storage.getHistory();
  history.push(saved);
  Storage.saveHistory(history);

  const qstatus = Storage.getQStatus();
  for (const r of saved.responses) {
    if (r.selected == null) continue; // unanswered questions do not change status
    const cur = qstatus[r.id] ?? { latest: null, everCorrect: false, attempts: 0, correct: 0, wrong: 0, lastAt: null };
    cur.attempts += 1;
    if (r.isCorrect) {
      cur.correct += 1;
      cur.everCorrect = true;
      cur.latest = 'correct';
    } else {
      cur.wrong += 1;
      cur.latest = 'wrong';
    }
    cur.lastAt = saved.completedAt;
    qstatus[r.id] = cur;
  }
  Storage.saveQStatus(qstatus);
  return saved;
}

/* ---------------- statistics ---------------- */

function aggregate(list) {
  const a = { quizzes: list.length, total: 0, correct: 0, wrong: 0, unanswered: 0, time: 0 };
  for (const x of list) {
    a.total += x.total;
    a.correct += x.correct;
    a.wrong += x.wrong;
    a.unanswered += x.unanswered;
    a.time += x.timeTaken || 0;
  }
  a.answered = a.correct + a.wrong;
  a.accuracy = pct(a.correct, a.total); // accuracy = correct ÷ total questions presented
  return a;
}

function unitMastery(unit, qstatus) {
  const total = unit.questions.length;
  const mastered = unit.questions.filter((q) => qstatus[q.id]?.everCorrect).length;
  const toReview = unit.questions.filter((q) => qstatus[q.id]?.latest === 'wrong').length;
  return { total, mastered, toReview };
}

export function computeStats(history, bank, qstatus = Storage.getQStatus()) {
  const overall = aggregate(history);

  let best = null;
  for (const a of history) {
    if (!best || a.accuracy > best.accuracy || (a.accuracy === best.accuracy && a.total > best.total)) best = a;
  }

  const bySubject = bank.subjects.map((subject) => {
    const agg = aggregate(history.filter((h) => h.subjectId === subject.id));
    const m = subject.units.reduce(
      (acc, u) => {
        const x = unitMastery(u, qstatus);
        return { total: acc.total + x.total, mastered: acc.mastered + x.mastered, toReview: acc.toReview + x.toReview };
      },
      { total: 0, mastered: 0, toReview: 0 },
    );
    return { subject, agg, ...m };
  });

  const byUnit = [];
  for (const subject of bank.subjects) {
    for (const unit of subject.units) {
      const agg = aggregate(history.filter((h) => h.subjectId === subject.id && h.unitId === unit.id));
      byUnit.push({ subject, unit, agg, ...unitMastery(unit, qstatus) });
    }
  }

  const recent = [...history].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  return { overall, best, bySubject, byUnit, recent };
}

/* ---------------- export / reset ---------------- */

export function exportHistory() {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJSON(`mcq-quiz-history-${stamp}.json`, {
    app: 'mcq-practice-studio',
    exportedAt: new Date().toISOString(),
    attempts: Storage.getHistory(),
    questionStatus: Storage.getQStatus(),
  });
}

export function resetProgress() {
  Storage.clearProgress();
}
