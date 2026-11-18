/* dashboard.js — Home dashboard, performance history page and the searchable question bank. */
import { state } from './state.js';
import { Storage } from './storage.js';
import { computeStats, exportHistory } from './progress.js';
import { MODES } from './quizEngine.js';
import { navigate } from './navigation.js';
import { h, icon, toast, confirmDialog, chip, pageHeader, emptyState, progressBar, ring } from './ui.js';
import { fmtPct, fmtDuration, fmtDateTime, timeAgo, plural, pct, accuracyTone, debounce } from './utils.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function statTile({ iconName, label, value, sub, tone = 'accent' }) {
  return h('div', { class: `stat-tile glass tone-${tone}` },
    h('span', { class: 'icon-bubble small' }, icon(iconName, 20)),
    h('div', { class: 'stat-body' }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null),
  );
}

function sparkline(values) {
  const w = 360;
  const hgt = 200;
  const pad = 8;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, hgt - pad - (Math.min(100, Math.max(0, v)) / 100) * (hgt - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${hgt - pad} L${pts[0][0].toFixed(1)} ${hgt - pad} Z`;
  const wrap = h('div', { class: 'sparkline' });
  wrap.innerHTML =
    `<svg viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" role="img" aria-label="Accuracy over your last ${values.length} quizzes">` +
    `<defs><linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:var(--accent);stop-opacity:.35"/><stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>` +
    `<path d="${area}" fill="url(#spark-fill)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('') +
    `</svg>`;
  return wrap;
}

const issueCount = (bank) => bank.issues.filter((i) => i.level !== 'info').length;

function attemptRow(a) {
  return h('a', { class: 'attempt-row', href: `#/result/${a.id}` },
    h('div', { class: `attempt-score tone-${accuracyTone(a.accuracy)}` }, `${a.score}/${a.total}`),
    h('div', { class: 'attempt-main' }, h('strong', {}, `${a.subjectName} · ${a.unitName}`), h('span', { class: 'muted' }, `${MODES[a.mode]?.label ?? a.mode} · ${timeAgo(a.completedAt)}`)),
    h('div', { class: 'attempt-acc' }, fmtPct(a.accuracy)),
    icon('chevronRight', 16, 'row-chevron'),
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function renderDashboard(container) {
  const { bank } = state;
  const history = Storage.getHistory();
  const qstatus = Storage.getQStatus();
  const stats = computeStats(history, bank, qstatus);
  const o = stats.overall;
  const rerender = () => {
    container.replaceChildren();
    renderDashboard(container);
  };

  container.append(
    h('section', { class: 'hero glass' },
      h('div', { class: 'hero-text' },
        h('div', { class: 'eyebrow' }, 'Welcome back'),
        h('h1', { class: 'gradient-text' }, 'Practise smarter,', h('br'), 'remember more.'),
        h('p', { class: 'subtitle' }, history.length ? `You have completed ${plural(o.quizzes, 'quiz', 'quizzes')} so far. Keep the streak going.` : 'Choose a subject and unit to take your first quiz. Your progress is saved automatically on this device.'),
        h('div', { class: 'hero-actions' }, h('a', { class: 'btn btn-primary', href: '#/subjects' }, icon('play', 16), 'Start practising'), h('a', { class: 'btn', href: '#/history' }, icon('history', 16), 'View history')),
      ),
      h('div', { class: 'hero-ring' }, ring(o.accuracy, { size: 150, stroke: 11, tone: history.length ? undefined : 'accent', children: [h('div', { class: 'ring-value' }, history.length ? fmtPct(o.accuracy) : '—'), h('div', { class: 'ring-caption' }, 'accuracy')] })),
    ),
  );

  if (state.session) {
    const s = state.session;
    const answered = Object.keys(s.answers).length;
    container.append(
      h('div', { class: 'banner banner-accent glass' },
        icon('play', 22),
        h('div', { class: 'banner-text' }, h('strong', {}, 'You have an unfinished quiz'), h('span', {}, `${s.subjectName} · ${s.unitName} · ${MODES[s.mode]?.label ?? s.mode} — ${answered} of ${s.items.length} answered`)),
        h('div', { class: 'banner-actions' },
          h('a', { class: 'btn btn-primary btn-sm', href: '#/quiz' }, 'Resume'),
          h('button', {
            type: 'button',
            class: 'btn btn-sm btn-danger',
            onClick: async () => {
              const ok = await confirmDialog({ title: 'Discard unfinished quiz?', message: 'Your answers for this quiz will be lost. This cannot be undone.', confirmText: 'Discard quiz', tone: 'danger' });
              if (!ok) return;
              Storage.clearActive();
              state.session = null;
              toast('Unfinished quiz discarded.', 'info');
              navigate('/');
              rerender();
            },
          }, 'Discard'),
        ),
      ),
    );
  }

  const problems = issueCount(bank);
  if (problems) {
    container.append(
      h('div', { class: 'banner banner-warn glass' },
        icon('alert', 22),
        h('div', { class: 'banner-text' }, h('strong', {}, `${plural(problems, 'issue')} found in your question files`), h('span', {}, bank.manifestError ?? 'Some questions or files were skipped. See Settings → Data health for details.')),
        h('div', { class: 'banner-actions' }, h('a', { class: 'btn btn-sm', href: '#/settings' }, 'View details')),
      ),
    );
  }

  container.append(
    h('div', { class: 'stats-grid' },
      statTile({ iconName: 'play', label: 'Quizzes attempted', value: o.quizzes }),
      statTile({ iconName: 'list', label: 'Questions answered', value: o.answered, sub: o.unanswered ? `${o.unanswered} skipped` : null }),
      statTile({ iconName: 'target', label: 'Overall accuracy', value: history.length ? fmtPct(o.accuracy, 1) : '—', tone: history.length ? accuracyTone(o.accuracy) : 'accent' }),
      statTile({ iconName: 'checkCircle', label: 'Correct answers', value: o.correct, tone: 'success' }),
      statTile({ iconName: 'xCircle', label: 'Incorrect answers', value: o.wrong, tone: 'danger' }),
      statTile({ iconName: 'trophy', label: 'Best score', value: stats.best ? `${stats.best.score}/${stats.best.total}` : '—', sub: stats.best ? `${fmtPct(stats.best.accuracy)} · ${stats.best.subjectName}, ${stats.best.unitName}` : null, tone: 'warn' }),
    ),
  );

  /* trend + recent */
  const chrono = [...history].sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1)).slice(-12);
  const trend = h('section', { class: 'glass panel' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Accuracy trend'), chrono.length ? chip(`Last ${chrono.length}`, 'muted') : null),
    chrono.length >= 2 ? sparkline(chrono.map((a) => a.accuracy)) : h('p', { class: 'muted empty-note' }, chrono.length ? 'Complete one more quiz to see your trend.' : 'Your accuracy over time will appear here after your first quizzes.'),
    chrono.length >= 2
      ? h('div', { class: 'trend-stats' },
          h('div', {}, h('b', {}, fmtPct(chrono[chrono.length - 1].accuracy)), h('span', {}, 'Latest')),
          h('div', {}, h('b', {}, fmtPct(chrono.reduce((n, a) => n + a.accuracy, 0) / chrono.length)), h('span', {}, 'Average')),
          h('div', {}, h('b', {}, fmtPct(Math.max(...chrono.map((a) => a.accuracy)))), h('span', {}, 'Best')),
        )
      : null,
  );
  const recent = h('section', { class: 'glass panel' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Recent attempts'), history.length > 5 ? h('a', { class: 'link', href: '#/history' }, 'See all') : null),
    stats.recent.length ? h('div', { class: 'attempt-list' }, stats.recent.slice(0, 5).map(attemptRow)) : h('p', { class: 'muted empty-note' }, 'No quizzes yet. Start one from the Subjects page.'),
  );
  container.append(h('div', { class: 'cols-2' }, trend, recent));

  /* subject-wise */
  container.append(
    h('section', { class: 'block' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Subject-wise performance')),
      bank.subjects.length
        ? h('div', { class: 'cards-grid' },
            stats.bySubject.map(({ subject, agg, total, mastered, toReview }) =>
              h('a', { class: 'glass card card-hover spot subject-perf', href: `#/subject/${encodeURIComponent(subject.id)}` },
                h('div', { class: 'card-top' }, h('span', { class: 'icon-bubble' }, icon(subject.icon, 24)), agg.quizzes ? chip(fmtPct(agg.accuracy), accuracyTone(agg.accuracy)) : chip('No attempts', 'muted')),
                h('h3', {}, subject.name),
                progressBar(pct(mastered, total), 'success'),
                h('div', { class: 'perf-meta' }, h('span', {}, h('b', {}, `${mastered}/${total}`), ' mastered'), h('span', {}, h('b', {}, agg.quizzes), ' quizzes'), h('span', {}, h('b', {}, toReview), ' to review')),
              ),
            ),
          )
        : emptyState({ compact: true, title: 'No subjects loaded', message: bank.manifestError ?? 'Add subjects to data/manifest.json.', actions: [h('a', { class: 'btn', href: '#/settings' }, 'Open Settings')] }),
    ),
  );

  /* unit-wise */
  if (bank.subjects.length) {
    let filter = 'all';
    const host = h('div', { class: 'unit-table' });
    const chips = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter units by subject' });
    const draw = () => {
      chips.replaceChildren(
        h('button', { type: 'button', class: `seg-btn${filter === 'all' ? ' active' : ''}`, onClick: () => { filter = 'all'; draw(); } }, 'All'),
        ...bank.subjects.map((s) => h('button', { type: 'button', class: `seg-btn${filter === s.id ? ' active' : ''}`, onClick: () => { filter = s.id; draw(); } }, s.name)),
      );
      const rows = stats.byUnit.filter((r) => filter === 'all' || r.subject.id === filter);
      host.replaceChildren(
        h('div', { class: 'unit-row head' }, h('span', {}, 'Unit'), h('span', {}, 'Mastery'), h('span', {}, 'Quizzes'), h('span', {}, 'Accuracy')),
        ...rows.map(({ subject, unit, agg, total, mastered }) =>
          h('a', { class: 'unit-row', href: `#/subject/${encodeURIComponent(subject.id)}/unit/${encodeURIComponent(unit.id)}` },
            h('span', { class: 'unit-name' }, h('strong', {}, unit.name), h('small', {}, subject.name)),
            h('span', { class: 'unit-mastery' }, progressBar(pct(mastered, total), 'success'), h('small', {}, `${mastered}/${total}`)),
            h('span', { class: 'unit-quizzes' }, agg.quizzes),
            h('span', { class: 'unit-acc' }, agg.quizzes ? chip(fmtPct(agg.accuracy), accuracyTone(agg.accuracy)) : chip('—', 'muted')),
          ),
        ),
      );
    };
    draw();
    container.append(h('section', { class: 'glass panel block' }, h('div', { class: 'section-head' }, h('h2', {}, 'Unit-wise performance'), chips), host));
  }
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export function renderHistory(container) {
  const { bank } = state;
  const history = [...Storage.getHistory()].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  let subjectId = 'all';
  let unitId = 'all';
  let mode = 'all';
  let visible = 20;

  container.append(
    pageHeader({
      eyebrow: 'Performance',
      title: 'Quiz history',
      subtitle: 'Every completed quiz is saved here. Click one to review your answers.',
      actions: [h('button', { type: 'button', class: 'btn', disabled: !history.length, onClick: () => { exportHistory(); toast('History exported as JSON.', 'success'); } }, icon('download', 16), 'Export JSON')],
    }),
  );

  if (!history.length) {
    return container.append(emptyState({ icon: 'history', title: 'No quizzes yet', message: 'Once you submit a quiz it will appear here with its score, accuracy and time.', actions: [h('a', { class: 'btn btn-primary', href: '#/subjects' }, icon('play', 16), 'Start a quiz')] }));
  }

  const subjectSel = h('select', { class: 'select', 'aria-label': 'Filter by subject', onChange: (e) => { subjectId = e.target.value; unitId = 'all'; drawFilters(); draw(true); } });
  const unitSel = h('select', { class: 'select', 'aria-label': 'Filter by unit', onChange: (e) => { unitId = e.target.value; draw(true); } });
  const modeSel = h('select', { class: 'select', 'aria-label': 'Filter by mode', onChange: (e) => { mode = e.target.value; draw(true); } },
    h('option', { value: 'all' }, 'All modes'), ...Object.values(MODES).map((m) => h('option', { value: m.id }, m.label)));
  const summary = h('div', { class: 'filter-summary muted' });
  const listHost = h('div', { class: 'history-list' });

  function drawFilters() {
    subjectSel.replaceChildren(h('option', { value: 'all' }, 'All subjects'), ...bank.subjects.map((s) => h('option', { value: s.id }, s.name)));
    subjectSel.value = subjectId;
    const units = subjectId === 'all' ? [] : bank.subjects.find((s) => s.id === subjectId)?.units ?? [];
    unitSel.replaceChildren(h('option', { value: 'all' }, 'All units'), ...units.map((u) => h('option', { value: u.id }, u.name)));
    unitSel.value = unitId;
    unitSel.disabled = subjectId === 'all';
  }

  function draw(reset = false) {
    if (reset) visible = 20;
    const rows = history.filter((a) => (subjectId === 'all' || a.subjectId === subjectId) && (unitId === 'all' || a.unitId === unitId) && (mode === 'all' || a.mode === mode));
    const avg = rows.length ? rows.reduce((n, a) => n + a.accuracy, 0) / rows.length : 0;
    summary.textContent = rows.length ? `${plural(rows.length, 'attempt')} · average accuracy ${fmtPct(avg, 1)}` : 'No attempts match these filters.';
    const shown = rows.slice(0, visible);
    listHost.replaceChildren(
      ...(rows.length
        ? [
            h('div', { class: 'history-row head' }, h('span', {}, 'Date'), h('span', {}, 'Quiz'), h('span', {}, 'Score'), h('span', {}, 'Accuracy'), h('span', {}, 'Time'), h('span', {})),
            ...shown.map((a) =>
              h('a', { class: 'history-row', href: `#/result/${a.id}` },
                h('span', { class: 'h-date' }, fmtDateTime(a.completedAt)),
                h('span', { class: 'h-quiz' }, h('strong', {}, `${a.subjectName} · ${a.unitName}`), h('small', {}, MODES[a.mode]?.label ?? a.mode)),
                h('span', { class: `h-score tone-${accuracyTone(a.accuracy)}` }, `${a.score}/${a.total}`),
                h('span', { class: 'h-acc' }, progressBar(a.accuracy, accuracyTone(a.accuracy)), h('small', {}, fmtPct(a.accuracy))),
                h('span', { class: 'h-time' }, fmtDuration(a.timeTaken)),
                icon('chevronRight', 16, 'row-chevron'),
              ),
            ),
            rows.length > shown.length ? h('button', { type: 'button', class: 'btn btn-sm show-more', onClick: () => { visible += 20; draw(); } }, `Show more (${rows.length - shown.length} left)`) : null,
          ]
        : [emptyState({ compact: true, icon: 'search', title: 'No matching attempts', message: 'Try a different subject, unit or mode.' })]),
    );
  }

  drawFilters();
  draw();
  container.append(h('div', { class: 'filters glass' }, subjectSel, unitSel, modeSel), summary, h('div', { class: 'glass panel history-panel' }, listHost));
}

/* ------------------------------------------------------------------ */
/* Question bank (search + filter)                                     */
/* ------------------------------------------------------------------ */

export function renderQuestionBank(container) {
  const { bank } = state;
  const qstatus = Storage.getQStatus();
  const all = [...bank.questionsById.values()];
  let query = '';
  let subjectId = 'all';
  let unitId = 'all';
  let status = 'all';
  let visible = 25;

  container.append(pageHeader({ eyebrow: 'Browse', title: 'Question bank', subtitle: 'Search every question you have loaded. Expand a question to see its answer and explanation.' }));
  if (!all.length) {
    return container.append(emptyState({ icon: 'inbox', title: 'No questions loaded', message: bank.manifestError ?? 'Add question files to data/manifest.json or import a JSON file.', actions: [h('a', { class: 'btn btn-primary', href: '#/settings' }, icon('upload', 16), 'Import questions')] }));
  }

  const search = h('input', { class: 'input search-input', type: 'search', placeholder: 'Search questions, options, IDs or explanations…', 'aria-label': 'Search questions', onInput: debounce((e) => { query = e.target.value.trim().toLowerCase(); visible = 25; draw(); }, 120) });
  const subjectSel = h('select', { class: 'select', 'aria-label': 'Filter by subject', onChange: (e) => { subjectId = e.target.value; unitId = 'all'; visible = 25; drawUnits(); draw(); } },
    h('option', { value: 'all' }, 'All subjects'), ...bank.subjects.map((s) => h('option', { value: s.id }, s.name)));
  const unitSel = h('select', { class: 'select', 'aria-label': 'Filter by unit', disabled: true, onChange: (e) => { unitId = e.target.value; visible = 25; draw(); } });
  const statusSel = h('select', { class: 'select', 'aria-label': 'Filter by status', onChange: (e) => { status = e.target.value; visible = 25; draw(); } },
    h('option', { value: 'all' }, 'Any status'), h('option', { value: 'new' }, 'Not answered yet'), h('option', { value: 'correct' }, 'Answered correctly'), h('option', { value: 'wrong' }, 'Needs review'));
  const count = h('div', { class: 'filter-summary muted' });
  const listHost = h('div', { class: 'qb-list' });

  function drawUnits() {
    const units = subjectId === 'all' ? [] : bank.subjects.find((s) => s.id === subjectId)?.units ?? [];
    unitSel.replaceChildren(h('option', { value: 'all' }, 'All units'), ...units.map((u) => h('option', { value: u.id }, u.name)));
    unitSel.value = 'all';
    unitSel.disabled = subjectId === 'all';
  }

  const statusOf = (q) => {
    const s = qstatus[q.id];
    if (!s) return 'new';
    return s.latest === 'wrong' ? 'wrong' : s.everCorrect ? 'correct' : 'new';
  };

  function item(q) {
    const st = statusOf(q);
    const chipFor = { new: chip('New', 'muted'), correct: chip('Correct', 'success'), wrong: chip('Needs review', 'danger') }[st];
    return h('details', { class: 'qb-item glass' },
      h('summary', {},
        h('span', { class: 'qb-id' }, q.id),
        h('span', { class: 'qb-text' }, q.question),
        chipFor,
        icon('chevronDown', 16, 'qb-caret'),
      ),
      h('div', { class: 'qb-body' },
        h('div', { class: 'qb-path muted' }, `${q.subjectName} · ${q.unitName}`),
        h('div', { class: 'options' }, Object.entries(q.options).map(([key, text]) =>
          h('div', { class: `option review${key === q.correctAnswer ? ' correct' : ''}` }, h('span', { class: 'opt-letter' }, key), h('span', { class: 'opt-text' }, text), key === q.correctAnswer ? h('span', { class: 'opt-tag tag-correct' }, icon('check', 13), 'Correct answer') : null))),
        h('div', { class: 'explanation' }, h('strong', {}, 'Explanation'), h('p', {}, q.explanation || 'No explanation provided.')),
      ),
    );
  }

  function draw() {
    const rows = all.filter((q) => {
      if (subjectId !== 'all' && q.subjectId !== subjectId) return false;
      if (unitId !== 'all' && q.unitId !== unitId) return false;
      if (status !== 'all' && statusOf(q) !== status) return false;
      if (!query) return true;
      const hay = `${q.id} ${q.question} ${Object.values(q.options).join(' ')} ${q.explanation}`.toLowerCase();
      return hay.includes(query);
    });
    count.textContent = `${plural(rows.length, 'question')} found`;
    const shown = rows.slice(0, visible);
    listHost.replaceChildren(
      ...(rows.length
        ? [...shown.map(item), rows.length > shown.length ? h('button', { type: 'button', class: 'btn btn-sm show-more', onClick: () => { visible += 25; draw(); } }, `Show more (${rows.length - shown.length} left)`) : null]
        : [emptyState({ compact: true, icon: 'search', title: 'No questions match', message: 'Try a different search term or clear the filters.' })]),
    );
  }

  drawUnits();
  draw();
  container.append(h('div', { class: 'filters glass bank-filters' }, h('div', { class: 'search-wrap' }, icon('search', 18), search), subjectSel, unitSel, statusSel), count, listHost);
}
