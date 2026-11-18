/* settings.js — theme, quiz preferences, JSON import, data health and backup / reset. */
import { state } from './state.js';
import { Storage } from './storage.js';
import { prepareImport, commitImport, removeImport, clearImports } from './dataLoader.js';
import { exportHistory, resetProgress } from './progress.js';
import { h, icon, toast, confirmDialog, chip, pageHeader, setTheme } from './ui.js';
import { downloadJSON, plural, fmtDateTime } from './utils.js';

const TEMPLATE = {
  subject: 'Computer Networking',
  unit: 'Unit 3',
  questions: [
    {
      id: 'CN-U3-001',
      question: 'What is a computer network?',
      options: { A: 'A collection of connected computers', B: 'A programming language', C: 'An operating system', D: 'A database' },
      correctAnswer: 'A',
      explanation: 'A computer network is a collection of interconnected devices that communicate and share resources.',
    },
  ],
};

function section(title, subtitle, ...children) {
  return h('section', { class: 'glass panel settings-section' }, h('div', { class: 'section-head stacked' }, h('h2', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null), ...children);
}

function toggleRow(label, hint, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'toggle-row' }, h('span', { class: 'toggle-text' }, h('strong', {}, label), h('small', { class: 'muted' }, hint)), h('span', { class: 'switch' }, input, h('span', { class: 'switch-track' })));
}

export function renderSettings(container, { reloadData }, lastReport = []) {
  const rerender = (report = []) => {
    container.replaceChildren();
    renderSettings(container, { reloadData }, report);
  };
  const { bank, settings } = state;

  container.append(pageHeader({ eyebrow: 'Configure', title: 'Settings & import', subtitle: 'Appearance, quiz preferences, question file import and data tools.' }));

  /* ---------- appearance + preferences ---------- */
  const themeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' });
  const drawTheme = () =>
    themeSeg.replaceChildren(
      ...[['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']].map(([value, label, ic]) =>
        h('button', { type: 'button', class: `seg-btn${state.settings.theme === value ? ' active' : ''}`, onClick: () => { setTheme(value); drawTheme(); } }, icon(ic, 15), label),
      ),
    );
  drawTheme();

  container.append(
    section('Appearance & quiz preferences', null,
      h('div', { class: 'toggle-row' }, h('span', { class: 'toggle-text' }, h('strong', {}, 'Theme'), h('small', { class: 'muted' }, 'Dark is the default. Your choice is remembered.')), themeSeg),
      toggleRow('Shuffle question order', 'Show questions in a random order every time.', settings.shuffleQuestions, (v) => { state.settings.shuffleQuestions = v; Storage.saveSettings(state.settings); }),
      toggleRow('Shuffle answer options', 'Randomise the position of A–D for every question.', settings.shuffleOptions, (v) => { state.settings.shuffleOptions = v; Storage.saveSettings(state.settings); }),
    ),
  );

  /* ---------- import ---------- */
  const results = h('div', { class: 'import-results', 'aria-live': 'polite' });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true, id: 'import-input', onChange: (e) => handleFiles([...e.target.files]).then(() => (e.target.value = '')) });
  const drop = h('div', {
    class: 'dropzone',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Choose JSON question files to import',
    onClick: () => fileInput.click(),
    onKeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fileInput.click()),
    onDragover: (e) => { e.preventDefault(); drop.classList.add('dragging'); },
    onDragleave: () => drop.classList.remove('dragging'),
    onDrop: (e) => { e.preventDefault(); drop.classList.remove('dragging'); handleFiles([...e.dataTransfer.files]); },
  }, icon('upload', 30), h('strong', {}, 'Drop JSON files here or click to browse'), h('span', { class: 'muted' }, 'Each file holds one subject and unit. Valid questions are added instantly; invalid ones are reported below.'));

  async function handleFiles(files) {
    const jsonFiles = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json');
    if (!jsonFiles.length) return toast('Please choose .json files.', 'warn');
    const report = [];
    let added = 0;
    for (const file of jsonFiles) {
      let text;
      try {
        text = await file.text();
      } catch (err) {
        report.push({ ok: false, fileName: file.name, fatal: `Could not read the file: ${err.message}`, problems: [] });
        continue;
      }
      const res = prepareImport(file.name, text, state.bank);
      if (res.ok && !commitImport(file.name, res.cleaned)) {
        report.push({ ok: false, fileName: file.name, fatal: 'Browser storage is full or blocked, so this file could not be saved.', problems: [] });
        continue;
      }
      if (res.ok) {
        added += res.accepted;
        await reloadData(); // so the next file's duplicate check sees this one
      }
      report.push(res);
    }
    if (added) toast(`Imported ${plural(added, 'question')}.`, 'success');
    else toast('Nothing was imported — see the details below.', 'error');
    rerender(report); // refresh data health + imported list, keeping this report visible
  }

  function drawReport(report) {
    results.replaceChildren(
      ...report.map((r) =>
        h('div', { class: `import-item ${r.ok ? 'ok' : 'fail'}` },
          icon(r.ok ? 'checkCircle' : 'xCircle', 20),
          h('div', {},
            h('strong', {}, r.fileName),
            r.ok
              ? h('p', {}, `${r.replaced ? 'Updated' : 'Imported'} ${plural(r.accepted, 'question')} into ${r.cleaned.subject} · ${r.cleaned.unit}.${r.problems.length ? ` ${plural(r.problems.length, 'problem')} skipped:` : ''}`)
              : h('p', {}, r.fatal),
            r.problems.length ? h('ul', {}, r.problems.map((p) => h('li', {}, p.message))) : null,
          ),
        ),
      ),
    );
  }
  drawReport(lastReport);

  const importedHost = h('div', { class: 'imported-list' });
  function refreshLists() {
    const imported = Storage.getImported();
    importedHost.replaceChildren(
      imported.length
        ? h('div', {},
            h('h3', { class: 'sub-title' }, 'Imported files'),
            ...imported.map((f) =>
              h('div', { class: 'file-row' },
                icon('file', 20),
                h('div', { class: 'file-info' }, h('strong', {}, f.name), h('small', { class: 'muted' }, `${f.data?.subject} · ${f.data?.unit} — ${plural(f.data?.questions?.length ?? 0, 'question')} · ${fmtDateTime(f.importedAt)}`)),
                h('button', {
                  type: 'button',
                  class: 'btn btn-sm btn-danger',
                  onClick: async () => {
                    const ok = await confirmDialog({ title: `Remove "${f.name}"?`, message: 'Its questions will no longer appear. Your quiz history is kept.', confirmText: 'Remove file', tone: 'danger' });
                    if (!ok) return;
                    removeImport(f.name);
                    await reloadData();
                    toast('Imported file removed.', 'info');
                    rerender();
                  },
                }, icon('trash', 14), 'Remove'),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No files imported yet. Files added to the manifest are loaded automatically and are not listed here.'),
    );
  }
  refreshLists();

  container.append(
    section('Import question files', 'Upload JSON files straight from your computer. They are stored in this browser and merged with the files from data/manifest.json. Re-importing a file with the same name replaces the earlier copy.',
      fileInput, drop,
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { downloadJSON('question-template.json', TEMPLATE); toast('Template downloaded.', 'success'); } }, icon('download', 14), 'Download JSON template')),
      results, importedHost,
    ),
  );

  /* ---------- data health ---------- */
  const issues = bank.issues;
  const summary = h('div', { class: 'health-summary' },
    chip(bank.manifestLoaded ? 'manifest.json loaded' : 'manifest.json failed', bank.manifestLoaded ? 'success' : 'danger', bank.manifestLoaded ? 'check' : 'x'),
    chip(plural(bank.subjects.length, 'subject'), 'muted'),
    chip(plural(bank.fileCount, 'file'), 'muted'),
    chip(plural(bank.totalQuestions, 'question'), 'accent'),
    bank.importedCount ? chip(`${plural(bank.importedCount, 'imported file')}`, 'muted') : null,
  );
  const levelIcon = { error: 'xCircle', warning: 'alert', info: 'info' };
  container.append(
    section('Data health', 'What the loader found when it read your manifest and question files.',
      summary,
      issues.length
        ? h('ul', { class: 'issue-list' }, issues.map((i) => h('li', { class: `issue issue-${i.level}` }, icon(levelIcon[i.level] ?? 'info', 18), h('div', {}, h('strong', {}, i.source), h('p', {}, i.message)))))
        : h('div', { class: 'all-good' }, icon('checkCircle', 20), 'Everything loaded cleanly — no problems found.'),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn btn-sm', onClick: async () => { await reloadData(); toast('Question files reloaded.', 'success'); rerender(); } }, icon('refresh', 14), 'Reload question files')),
    ),
  );

  /* ---------- backup + reset ---------- */
  const history = Storage.getHistory();
  container.append(
    section('Your data', `${plural(history.length, 'quiz attempt')} saved on this device. Progress is stored in this browser only.`,
      h('div', { class: 'row-actions wrap' },
        h('button', { type: 'button', class: 'btn', disabled: !history.length, onClick: () => { exportHistory(); toast('History exported as JSON.', 'success'); } }, icon('download', 16), 'Export quiz history (JSON)'),
        h('button', {
          type: 'button',
          class: 'btn btn-danger',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'Clear all progress?', message: 'This deletes your quiz history, per-question results and any unfinished quiz. Imported question files are kept. This cannot be undone — consider exporting your history first.', confirmText: 'Clear all progress', tone: 'danger' });
            if (!ok) return;
            resetProgress();
            state.session = null;
            await reloadData();
            toast('All progress cleared.', 'success');
            rerender();
          },
        }, icon('trash', 16), 'Clear all progress'),
        Storage.getImported().length
          ? h('button', {
              type: 'button',
              class: 'btn btn-danger',
              onClick: async () => {
                const ok = await confirmDialog({ title: 'Remove all imported files?', message: 'Every file you imported through the interface will be removed. Files from the manifest and your history are not affected.', confirmText: 'Remove imports', tone: 'danger' });
                if (!ok) return;
                clearImports();
                await reloadData();
                toast('Imported files removed.', 'info');
                rerender();
              },
            }, icon('trash', 16), 'Remove imported files')
          : null,
      ),
    ),
  );
}
