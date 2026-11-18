# MCQ Practice Studio

A JSON-driven MCQ practice app for exam revision, built with plain HTML5, CSS3 and vanilla JavaScript (ES modules). No frameworks, no build step, no backend. Your progress is saved in the browser's `localStorage`.

- **Subjects:** Computer Networking, Virtualization, Artificial Intelligence, Operating System
- **Units:** Unit 3, Unit 4, Unit 5 for each subject
- **Flow:** Dashboard → Subject → Unit → Quiz mode → Quiz → Result
- **Modes:** Fresh Quiz, Correct Answer Quiz, Wrong Answer Quiz
- **Design:** Liquid Glassmorphism, dark by default, with a light theme

---

## 1. Run it locally

Browsers block `fetch()` and ES modules when a page is opened straight from disk (`file://`), so the app must be served over `http://`.

**VS Code Live Server (recommended)**
1. Install the **Live Server** extension.
2. Open the `mcq-quiz` folder in VS Code.
3. Right-click `index.html` → **Open with Live Server**.

**Or use Python** (in the `mcq-quiz` folder):
```bash
python -m http.server 8000
# then open http://localhost:8000
```

If you open `index.html` directly, the app shows a message explaining this instead of failing silently.

---

## 2. Folder structure

```
mcq-quiz/
├── index.html              App shell (sidebar, view area, modal and toast roots)
├── css/
│   ├── style.css           Design tokens, Liquid Glass primitives, layout, buttons, modals
│   ├── dashboard.css       Cards, dashboard, history, question bank, settings
│   └── quiz.css            Quiz screen, options, navigator, result and review
├── js/
│   ├── app.js              Boot sequence, route table, global handlers
│   ├── state.js            Shared in-memory state (bank, settings, active session)
│   ├── utils.js            Formatting, shuffle, helpers
│   ├── storage.js          The ONLY file that touches localStorage
│   ├── dataLoader.js       manifest.json + file loading, validation, imports
│   ├── quizEngine.js       Building/restoring/scoring a quiz, timer (no DOM)
│   ├── progress.js         Attempt recording, per-question status, statistics, export
│   ├── ui.js               DOM builder, icons, modal, toast, shared components
│   ├── navigation.js       Router, sidebar, Subjects → Units → Mode pages, startQuiz()
│   ├── dashboard.js        Dashboard, History page, Question Bank
│   ├── quizView.js         Live quiz screen and the Result / review screen
│   └── settings.js         Settings, JSON import, data health, backup and reset
├── data/
│   ├── manifest.json       Lists every subject, unit and question file
│   ├── computer-networking/unit3.json (10 sample questions) unit4.json unit5.json
│   ├── virtualization/unit3.json unit4.json unit5.json
│   ├── artificial-intelligence/unit3.json unit4.json unit5.json
│   └── operating-system/unit3.json (5 sample questions) unit4.json unit5.json
└── README.md
```

Data loading, quiz logic, storage and UI rendering are kept in separate modules.

---

## 3. Adding your questions

### Question file format

One file per subject and unit, for example `data/virtualization/unit4.json`:

```json
{
  "subject": "Virtualization",
  "unit": "Unit 4",
  "questions": [
    {
      "id": "VZ-U4-001",
      "question": "Which hypervisor type runs directly on the hardware?",
      "options": {
        "A": "Type 1",
        "B": "Type 2",
        "C": "Hosted",
        "D": "Emulated"
      },
      "correctAnswer": "A",
      "explanation": "Type 1 (bare-metal) hypervisors run directly on the host hardware."
    }
  ]
}
```

Rules (checked automatically when the app loads):

| Rule | Detail |
|---|---|
| Unique `id` | Every question needs an ID that is unique across **all** files. Duplicates are skipped and reported. |
| Exactly 4 options | The keys are normally `A`–`D`. |
| `correctAnswer` | Must be one of the option keys (a lower-case `"a"` is accepted). |
| `explanation` | Optional but recommended. It is shown after you submit. |

**Tips**
- Use a consistent ID pattern such as `CN-U3-001`, `VZ-U4-012`, `AI-U5-007`, `OS-U3-020`.
- Question IDs are how progress is tracked. **Never reuse an ID for a different question.** You can freely fix typos in an existing question's text, options or explanation, and its history is kept. If you change which option is correct, the old attempt records keep the answer that was marked at the time.
- Options are shuffled in quizzes, so avoid explanations that say "option A is correct because…". Refer to the answer text instead.

### Where files are registered: `data/manifest.json`

Browsers cannot list a folder, so `manifest.json` tells the app which files exist:

```json
{
  "subjects": [
    {
      "id": "computer-networking",
      "name": "Computer Networking",
      "icon": "network",
      "description": "Protocols, layers, addressing and network devices.",
      "units": [
        { "id": "unit3", "name": "Unit 3", "file": "computer-networking/unit3.json" },
        { "id": "unit4", "name": "Unit 4", "file": "computer-networking/unit4.json" },
        { "id": "unit5", "name": "Unit 5", "file": "computer-networking/unit5.json" }
      ]
    }
  ]
}
```

- `file` is relative to the `data/` folder.
- A unit can use several files: `"files": ["operating-system/unit3.json", "operating-system/unit3-extra.json"]`.
- Available icons: `network`, `layers`, `cpu`, `terminal`, `book`.
- **To add questions to an existing unit:** just edit that unit's JSON file and refresh the page (or press **Reload question files** in Settings). No JavaScript changes and no manifest change are needed.
- **To add a new unit or subject:** add its entry to `manifest.json` and create the file.

All 12 files in the default manifest already exist. Ten are empty (`"questions": []`) and are waiting for your questions. Empty or missing units show a helpful empty state instead of a broken quiz.

---

## 4. Importing JSON from the interface

**Settings → Import question files** (drag and drop or click to browse; several files at once is fine).

- The file uses the same format as above. The `subject` and `unit` inside the file decide where it goes. A name that matches an existing subject or unit (for example `"Unit 3"` ↔ `unit3`) is merged into it. A new name creates a new subject or unit.
- Valid questions are added immediately. Invalid or duplicate ones are skipped and listed with the reason, for example `question #4 ("CN-U3-004"): "correctAnswer" is "E" but the option keys are A, B, C, D`.
- Imported files live in this browser's storage. They are merged with the manifest files and listed under **Imported files**, where you can remove them.
- Re-importing a file with the **same file name** replaces the previous copy. This is how you update imported questions.
- **Download JSON template** gives you a ready-to-edit starting file.
- Importing never creates duplicate question IDs: the first copy wins and later copies are reported.

---

## 5. How quizzes work

| Mode | Questions included | After you answer |
|---|---|---|
| **Fresh Quiz** | Never answered correctly (new questions and past mistakes) | Correct → leaves Fresh. Wrong → stays available. |
| **Correct Answer Quiz** | Answered correctly at least once | Stays here even if you miss it later. Its latest status becomes "wrong". |
| **Wrong Answer Quiz** | Latest answer was wrong | Correct → leaves this list. Wrong again → stays. |

- Question order and answer-option order are shuffled each time (switchable in Settings). You can also limit a quiz to 10, 20, 30 or 50 questions on the mode page.
- Answers are hidden while you take the quiz. After submitting you see the correct answer and the explanation for every question.
- **Scoring:** correct = +1, wrong = 0, unanswered = 0.
- **Accuracy** = correct ÷ total questions in the quiz. Skipping a question counts against you.
- Unanswered questions do not change a question's status.
- Every submitted quiz is saved automatically with subject, unit, mode, score, counts, accuracy, time taken, date and time, and each question ID with your response.
- **Keyboard:** `A`–`D` or `1`–`4` answer, `←` `→` move between questions.
- **Unfinished quizzes:** progress and the timer are saved as you go. If you refresh or close the tab, the app returns you to the quiz (or offers *Resume* on the dashboard). Leaving the quiz page asks for confirmation, and a browser refresh warns you if you have answered anything.

## 6. Other pages

- **Dashboard:** totals, overall accuracy, best score, accuracy trend, recent attempts, subject-wise and unit-wise performance.
- **History:** every attempt, filterable by subject, unit and mode. Click an attempt to review it. **Export JSON** downloads your history and per-question status.
- **Question Bank:** search all loaded questions (text, options, ID, explanation) and filter by subject, unit and status.
- **Settings:** theme, shuffle options, import, *Data health* (every problem found in your files, with file and question), backup/export, **Clear all progress** (with confirmation) and removal of imported files.

## 7. Notes and limits

- Progress is stored **per browser and per device** (localStorage, roughly 5 MB). Use *Export JSON* in History or Settings if you want a backup.
- Clearing your browser's site data erases progress. **Clear all progress** keeps imported question files.
- If browser storage is blocked (some private modes), the app still works for the session and shows a "Progress not saved" notice.
