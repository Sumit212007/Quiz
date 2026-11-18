/* quizView.js — the live quiz screen and the result / review screen. */
import { state } from './state.js';
import { Storage } from './storage.js';
import { QuizTimer, scoreSession, MODES } from './quizEngine.js';
import { recordAttempt } from './progress.js';
import { navigate, startQuiz } from './navigation.js';
import { h, icon, toast, confirmDialog, chip, emptyState, ring, isModalOpen } from './ui.js';
import { fmtClock, fmtDuration, fmtDateTime, fmtPct, accuracyTone } from './utils.js';

const LETTERS = ['A', 'B', 'C', 'D'];

/* ================================================================== */
/* Live quiz                                                           */
/* ================================================================== */

export function renderQuiz(container) {
  const session = state.session;
  if (!session) {
    container.append(emptyState({ icon: 'play', title: 'No quiz in progress', message: 'Pick a subject, unit and mode to start a quiz.', actions: [h('a', { class: 'btn btn-primary', href: '#/subjects' }, 'Choose a subject')] }));
    return;
  }

  const { bank } = state;
  const items = session.items;
  const getQ = (i) => bank.questionsById.get(items[i].id);
  let submitted = false;

  const timerText = h('span', { class: 'timer-text' }, fmtClock(session.elapsed));
  const timer = new QuizTimer(session.elapsed, (sec) => (timerText.textContent = fmtClock(sec)));

  const progressFill = h('div', { class: 'bar-fill' });
  const progressLabel = h('span', { class: 'progress-label' });
  const qHost = h('div', { class: 'q-host' });
  const gridEl = h('div', { class: 'q-grid', role: 'list' });
  const panelStats = h('div', { class: 'panel-stats' });

  /* ---- persistence ---- */
  function save() {
    if (submitted || state.session !== session) return;
    session.elapsed = timer.elapsed();
    Storage.saveActive(session);
  }
  const answeredCount = () => items.filter((it) => session.answers[it.id]).length;

  /* ---- rendering ---- */
  function renderProgress() {
    const done = answeredCount();
    progressFill.style.width = `${(done / items.length) * 100}%`;
    progressLabel.textContent = `${done} / ${items.length} answered`;
    panelStats.replaceChildren(
      h('div', {}, h('b', {}, done), ' answered'),
      h('div', {}, h('b', {}, items.length - done), ' remaining'),
    );
  }

  function renderNav() {
    gridEl.replaceChildren(
      ...items.map((it, i) => {
        const answered = Boolean(session.answers[it.id]);
        return h('button', {
          type: 'button',
          role: 'listitem',
          class: `q-dot${i === session.currentIndex ? ' current' : ''}${answered ? ' answered' : ''}`,
          'aria-label': `Question ${i + 1}, ${answered ? 'answered' : 'not answered'}`,
          'aria-current': i === session.currentIndex ? 'step' : null,
          onClick: () => go(i),
        }, String(i + 1));
      }),
    );
  }

  function renderQuestion({ animate = false, focusIndex = null } = {}) {
    const i = session.currentIndex;
    const q = getQ(i);
    const it = items[i];
    const chosen = session.answers[it.id];

    const options = it.order.map((key, idx) =>
      h('button', {
        type: 'button',
        role: 'radio',
        class: `option${chosen === key ? ' selected' : ''}`,
        'aria-checked': chosen === key ? 'true' : 'false',
        onClick: () => select(key, idx),
      }, h('span', { class: 'opt-letter' }, LETTERS[idx]), h('span', { class: 'opt-text' }, q.options[key])),
    );

    qHost.replaceChildren(
      h('article', { class: `q-card glass${animate ? ' enter' : ''}` },
        h('div', { class: 'q-meta' },
          h('span', { class: 'q-number' }, `Question ${i + 1}`, h('em', {}, ` of ${items.length}`)),
          chosen ? chip('Answered', 'accent', 'check') : chip('Not answered', 'muted'),
        ),
        h('h2', { class: 'q-text' }, q.question),
        h('div', { class: 'options', role: 'radiogroup', 'aria-label': 'Answer options' }, options),
        h('div', { class: 'q-tools' },
          chosen
            ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: clearAnswer }, icon('x', 14), 'Clear answer')
            : h('span', { class: 'hint' }, 'Tip: press A–D (or 1–4) to answer, ← → to move between questions.'),
        ),
        h('div', { class: 'q-footer' },
          h('button', { type: 'button', class: 'btn', disabled: i === 0, onClick: () => go(i - 1) }, icon('arrowLeft', 16), 'Previous'),
          h('button', { type: 'button', class: 'btn', disabled: i === items.length - 1, onClick: () => go(i + 1) }, 'Next', icon('arrowRight', 16)),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-primary', id: 'submit-quiz', onClick: submit }, icon('check', 16), 'Submit Quiz'),
        ),
      ),
    );
    if (focusIndex != null) qHost.querySelectorAll('.option')[focusIndex]?.focus();
  }

  /* ---- actions ---- */
  function go(i) {
    session.currentIndex = Math.min(items.length - 1, Math.max(0, i));
    save();
    renderQuestion({ animate: true });
    renderNav();
  }
  function select(key, idx) {
    session.answers[items[session.currentIndex].id] = key;
    save();
    renderQuestion({ focusIndex: idx });
    renderNav();
    renderProgress();
  }
  function clearAnswer() {
    delete session.answers[items[session.currentIndex].id];
    save();
    renderQuestion();
    renderNav();
    renderProgress();
  }

  async function submit() {
    if (submitted) return;
    const unanswered = items.length - answeredCount();
    const ok = await confirmDialog({
      title: 'Submit this quiz?',
      message: h('div', {},
        h('p', {}, unanswered ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. ${unanswered === 1 ? 'It' : 'They'} will score 0.` : 'You have answered every question.'),
        h('p', { class: 'muted' }, 'Once submitted you cannot change your answers.'),
      ),
      confirmText: 'Submit quiz',
      cancelText: 'Keep working',
    });
    if (!ok || submitted) return;

    submitted = true;
    const elapsed = timer.stop();
    const attempt = scoreSession(session, bank, elapsed);
    const saved = recordAttempt(attempt);
    Storage.clearActive();
    state.session = null;
    window.removeEventListener('beforeunload', onBeforeUnload);
    navigate(`/result/${saved.id}`);
  }

  /* ---- keyboard + unload protection ---- */
  function onKey(e) {
    if (isModalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const i = session.currentIndex;
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else {
      const idx = /^[1-4]$/.test(e.key) ? Number(e.key) - 1 : LETTERS.indexOf(e.key.toUpperCase());
      if (idx >= 0 && idx < 4 && e.key.length === 1) select(items[i].order[idx], idx);
    }
  }
  function onBeforeUnload(e) {
    save();
    if (Object.keys(session.answers).length) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  const onPageHide = () => save();

  /* ---- layout ---- */
  container.append(
    h('div', { class: 'quiz-head glass' },
      h('div', { class: 'quiz-title' }, h('div', { class: 'eyebrow' }, MODES[session.mode]?.label ?? 'Quiz'), h('h1', {}, `${session.subjectName} · ${session.unitName}`)),
      h('div', { class: 'timer-chip', title: 'Time elapsed' }, icon('clock', 18), timerText),
      h('div', { class: 'quiz-progress' }, h('div', { class: 'bar', role: 'progressbar' }, progressFill), progressLabel),
    ),
    h('div', { class: 'quiz-layout' },
      h('section', { class: 'q-main', 'aria-label': 'Question' }, qHost),
      h('aside', { class: 'q-panel glass', 'aria-label': 'Question navigator' },
        h('h3', {}, 'Questions'),
        gridEl,
        h('div', { class: 'legend' },
          h('span', {}, h('i', { class: 'dot current' }), 'Current'),
          h('span', {}, h('i', { class: 'dot answered' }), 'Answered'),
          h('span', {}, h('i', { class: 'dot' }), 'Unanswered'),
        ),
        panelStats,
      ),
    ),
  );

  renderQuestion({ animate: true });
  renderNav();
  renderProgress();
  timer.start();
  const autosave = setInterval(save, 5000);
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    clearInterval(autosave);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pagehide', onPageHide);
    if (!submitted) save();
    timer.stop();
  };
}

/* ================================================================== */
/* Result + review                                                     */
/* ================================================================== */

function verdict(accuracy) {
  if (accuracy >= 90) return { title: 'Outstanding!', text: 'You have a great grip on this material.' };
  if (accuracy >= 75) return { title: 'Great work', text: 'A strong result — review the few you missed.' };
  if (accuracy >= 50) return { title: 'Good effort', text: 'You are getting there. The explanations below will help.' };
  return { title: 'Keep going', text: 'Review the explanations below and try the Wrong Answer Quiz next.' };
}

export function renderResult(container, { id }) {
  const attempt = Storage.getHistory().find((a) => a.id === id);
  if (!attempt) {
    container.append(emptyState({ icon: 'search', title: 'Result not found', message: 'This attempt is not in your history (it may have been cleared).', actions: [h('a', { class: 'btn btn-primary', href: '#/history' }, 'Open history')] }));
    return;
  }
  const { bank } = state;
  const v = verdict(attempt.accuracy);
  const tone = accuracyTone(attempt.accuracy);
  const unitPath = `#/subject/${encodeURIComponent(attempt.subjectId)}/unit/${encodeURIComponent(attempt.unitId)}`;

  const stat = (label, value, cls = '') => h('div', { class: `result-stat glass ${cls}` }, h('div', { class: 'result-stat-value' }, value), h('div', { class: 'result-stat-label' }, label));

  const hero = h('section', { class: 'result-hero glass' },
    ring(attempt.accuracy, { size: 176, stroke: 12, children: [h('div', { class: 'ring-value' }, fmtPct(attempt.accuracy, attempt.accuracy % 1 ? 1 : 0)), h('div', { class: 'ring-caption' }, 'accuracy')] }),
    h('div', { class: 'result-text' },
      h('div', { class: 'eyebrow' }, 'Quiz complete'),
      h('h1', {}, v.title),
      h('p', { class: 'subtitle' }, v.text),
      h('div', { class: 'result-score' }, 'Score: ', h('b', { class: `tone-${tone}` }, `${attempt.score}/${attempt.total}`)),
      h('div', { class: 'chip-row' }, chip(`${attempt.subjectName} · ${attempt.unitName}`, 'accent'), chip(MODES[attempt.mode]?.label ?? attempt.mode, 'muted'), chip(fmtDateTime(attempt.completedAt), 'muted', 'clock')),
      h('div', { class: 'result-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => startQuiz(attempt.subjectId, attempt.unitId, attempt.mode) }, icon('refresh', 16), 'Try again'),
        h('a', { class: 'btn', href: unitPath }, 'Choose another mode'),
        h('a', { class: 'btn btn-ghost', href: '#/' }, 'Dashboard'),
      ),
    ),
  );

  const stats = h('div', { class: 'result-stats' },
    stat('Score', `${attempt.score}/${attempt.total}`),
    stat('Accuracy', fmtPct(attempt.accuracy, attempt.accuracy % 1 ? 1 : 0)),
    stat('Total questions', attempt.total),
    stat('Correct', attempt.correct, 'tone-success'),
    stat('Incorrect', attempt.wrong, 'tone-danger'),
    stat('Unanswered', attempt.unanswered, 'tone-muted'),
    stat('Time taken', fmtDuration(attempt.timeTaken)),
  );

  /* ---- review ---- */
  const status = (r) => (r.selected == null ? 'skipped' : r.isCorrect ? 'correct' : 'wrong');
  const counts = { all: attempt.responses.length, wrong: attempt.wrong, skipped: attempt.unanswered, correct: attempt.correct };
  let filter = 'all';

  const filterHost = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter review' });
  const mapHost = h('div', { class: 'review-map' });
  const listHost = h('div', { class: 'review-list' });

  function reviewCard(r, idx) {
    const q = bank.questionsById.get(r.id);
    const st = status(r);
    const label = { correct: 'Correct', wrong: 'Incorrect', skipped: 'Unanswered' }[st];
    const head = h('div', { class: 'q-meta' }, h('span', { class: 'q-number' }, `Question ${idx + 1}`), chip(label, { correct: 'success', wrong: 'danger', skipped: 'muted' }[st], { correct: 'check', wrong: 'x', skipped: null }[st]));
    if (!q) {
      return h('article', { class: `review-card glass is-${st}`, id: `rv-${idx + 1}` }, head, h('p', { class: 'muted' }, `Question ${r.id} is no longer in your question files, so its text cannot be shown.`));
    }
    const keys = Object.keys(q.options);
    const order = Array.isArray(r.order) && r.order.length === keys.length && r.order.every((k) => keys.includes(k)) ? r.order : keys;
    const correctKey = r.correct ?? q.correctAnswer;
    return h('article', { class: `review-card glass is-${st}`, id: `rv-${idx + 1}` },
      head,
      h('h3', { class: 'q-text' }, q.question),
      h('div', { class: 'options' },
        order.map((key, pos) => {
          const isCorrect = key === correctKey;
          const picked = key === r.selected;
          return h('div', { class: `option review${isCorrect ? ' correct' : ''}${picked && !isCorrect ? ' wrong' : ''}${picked ? ' picked' : ''}` },
            h('span', { class: 'opt-letter' }, LETTERS[pos]),
            h('span', { class: 'opt-text' }, q.options[key]),
            isCorrect ? h('span', { class: 'opt-tag tag-correct' }, icon('check', 13), picked ? 'Your answer · Correct' : 'Correct answer') : picked ? h('span', { class: 'opt-tag tag-wrong' }, icon('x', 13), 'Your answer') : null,
          );
        }),
      ),
      h('div', { class: 'explanation' }, h('strong', {}, 'Explanation'), h('p', {}, q.explanation || 'No explanation was provided for this question.')),
    );
  }

  function renderReview() {
    const defs = [['all', 'All'], ['wrong', 'Incorrect'], ['skipped', 'Unanswered'], ['correct', 'Correct']];
    filterHost.replaceChildren(
      ...defs.map(([key, label]) =>
        h('button', { type: 'button', class: `seg-btn${filter === key ? ' active' : ''}`, onClick: () => { filter = key; renderReview(); } }, `${label} (${counts[key]})`),
      ),
    );
    mapHost.replaceChildren(
      ...attempt.responses.map((r, i) =>
        h('button', {
          type: 'button',
          class: `map-dot is-${status(r)}`,
          'aria-label': `Question ${i + 1}: ${status(r)}`,
          title: `Question ${i + 1}`,
          onClick: () => {
            if (filter !== 'all') { filter = 'all'; renderReview(); }
            document.getElementById(`rv-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }, String(i + 1)),
      ),
    );
    const shown = attempt.responses.map((r, i) => ({ r, i })).filter(({ r }) => filter === 'all' || status(r) === filter);
    listHost.replaceChildren(...(shown.length ? shown.map(({ r, i }) => reviewCard(r, i)) : [emptyState({ compact: true, icon: 'check', title: 'Nothing to show', message: 'No questions match this filter.' })]));
  }
  renderReview();

  container.append(
    hero,
    stats,
    h('section', { class: 'review' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Review answers'), filterHost),
      mapHost,
      listHost,
    ),
  );
}
