LLM FROM ZERO — LOCAL LEARNING BUILD 4.10.0

Source: https://github.com/manojhunasimarad/manojhunasimarad.github.io/tree/main/llm-from-zero
Baseline commit: 94c4cb8df1e4408826a520516b5a97593ff69ab4

Node.js 22+ is needed for the studio server; there are no npm dependencies.
Start: node tools/serve.mjs (or START-STUDIO.cmd)
Open: http://127.0.0.1:8765/studio.html
Native practice: node tools/launch-native.mjs --port 8770 (Python 3.10+)
Native practice data: py/data/

Tests: npm test (or node --test tools/check.test.mjs tools/learning.test.mjs tools/learning-render.test.mjs tools/quiz.test.mjs tools/etl.test.mjs tools/sync.test.mjs tools/projects.test.mjs tools/auth.test.mjs tools/clock.test.mjs tools/coach.test.mjs)
Native and sync checks: python tools/check-native.py
All reference exercises: python tools/audit-exercises.py
Windows audio: node tools/export-audio.mjs

The studio opens without Python. Practice in the static browser version needs its initial Pyodide download; native practice avoids it. Studio search and evidence notes work without a model. Ollama is optional and no model is downloaded automatically. The Node bridge uses only the loopback Ollama endpoint.

Android: copy exported audio files to a media player for background playback. Browser narration can be interrupted by phone locking. Publish the static source files to your Pages course folder before expecting the new studio on the public URL. Audio is separate and should not be pushed as large Git files.

Studio and practice progress have separate backups. Studio can import practice lesson completion as evidence; verified mastery remains a user decision. No automatic sync. Imported text documents are session-only.

Preserve upstream and vendor licensing. No new top-level license is asserted. See the external REVIEW.html and START-HERE.html delivered alongside this source for the full review and setup instructions.

Version 4.2.0 adds Today, a 36-topic curriculum, projects, recall, evidence and quiz tests from 325 questions. Learning-plan backups include new quiz scores. Read REVIEW.html for the full 16-section report.

Version 4.3.0 adds a separate section for the e-commerce ETL project (github.com/manojhunasimarad/ETL): the ETL project page (#/etl), 13 Data engineering lessons, 26 exercises in Python and SQLite, 31 quiz questions and 19 topics on the learning map (55 in all). On the ETL page you pick a goal, one step of the project or the whole of it, and see only what it needs: the prerequisite graph is walked backwards from the goal, the walk stops at topics you know (marked, demonstrated in the learning desk, or tested out of by solving the topic's checkpoint exercise), the rest is put in topological order and the longest chain of study hours is marked. The graph rules are in etl-core.mjs and tested in tools/etl.test.mjs.

Version 4.5.0 adds sync across devices and a colour theme switch. Sync keeps the learning plan, Learn & listen notes, ETL checks and (from the practice app) exercises and recall in one secret gist in your own GitHub account, using a fine-grained token with only Gists read and write; each kind of data merges with the same rule as its backup file, and nothing is deleted by a sync (cloud-sync.mjs, sync-ui.mjs, tested in tools/sync.test.mjs). The theme follows the device by default; the header button switches System, Light and Dark, per device (theme.js).

Version 4.6.0 adds "Download everything for offline" (Your free setup in the studio, Your devices in Settings): the service worker saves the app, all content, Python and NumPy, and the page asks the browser to keep that storage (offline.mjs, downloadAll in sw.js). Voices, exported audio, Open-Deep-ML problems and uploaded papers are listed there with their own steps.

Version 4.7.0 adds the resume projects (content/projects.json, #/projects): the RAG & agentic knowledge assistant, the federated learning testbed and the GPU-accelerated ML pipeline, each with the ETL page's goal-based plan and "check what you know" (now one page over a project spec), 20 topics on the learning map, 20 lessons under Learn, 34 quiz questions and a studio track each. Sync carries their plans and checks. Work mode for sync keeps the GitHub token in session storage only, so a work or shared computer forgets it when the browser closes. Tests: tools/projects.test.mjs.

Version 4.8.0 adds Sign in with GitHub for sync (auth.mjs, auth.html; the helper that holds the OAuth secret is ../auth-worker/worker.js on Cloudflare Workers, set up as in ../auth-worker/README.md). Until it is configured, the sync panel keeps token paste. Sign out revokes the token. Tests: tools/auth.test.mjs.
Version 4.9.0 gives both pages one navigation and adds the Study clock. The header (site-nav.mjs, site.css) has six sections, Today, Learn, Practice, Review, Projects and Progress, each with its own tabs; a gear for setup and settings; search over pages, topics, lessons and exercises (Ctrl+K or /, and g then a letter to jump to a section); and a bottom tab bar on phones. Tabs that open the practice app are marked Py. Both pages share one set of light and dark colours, and the learning map is drawn in theme colours. The two laptop servers now serve theme.js and the sync and offline modules (they did not, so the studio and dark mode broke when started locally); a test checks every file the pages load is served and saved for offline. The Study clock (studio.html#clock, clock-core.mjs, clock.mjs) builds a weekly learn → recall → use timetable from your routine, runs a timer with body breaks and recall prompts that keeps going on every page, and exports the week as a calendar file with alarms or as a list for the phone's Clock app (tools/clock.test.mjs).

Version 4.10.0 adds "What now?" (coach-core.mjs, coach.mjs, tools/coach.test.mjs). When you open the site (after 45 minutes away, with no timer running) a card says what to do at this moment, from your Study clock routine and your learning plan: during a study block, which page to open and the timer plan that fits the minutes left; before a block, how to get ready; at work, that work comes first; in free time, one optional round; in the last hour before sleep, a 10-minute recall or nothing; at night, sleep. One button starts the timer and opens the page. The rule for when to press Start is on the card and on the Study clock: the moment the material is open, not while choosing. While a page is open the site also rings 5 minutes before and at the start of each block, at sleep time, and after 90 seconds on a lesson, topic, exercise or recall page with no timer running. "What now?" in the header reopens the card; both automatic parts can be switched off on the Study clock. Finished rounds are counted (lfz-clock-log) and "Log it on Today" fills in the log form. Today and every topic page have a button that starts the timer with the topic; a second timer asks before replacing the running one.
