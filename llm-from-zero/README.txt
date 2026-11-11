LLM FROM ZERO — LOCAL LEARNING BUILD 4.2.0

Source: https://github.com/manojhunasimarad/manojhunasimarad.github.io/tree/main/llm-from-zero
Baseline commit: 94c4cb8df1e4408826a520516b5a97593ff69ab4

Node.js 22+ is needed for the studio server; there are no npm dependencies.
Start: node tools/serve.mjs (or START-STUDIO.cmd)
Open: http://127.0.0.1:8765/studio.html
Native practice: node tools/launch-native.mjs --port 8770 (Python 3.10+)
Native practice data: py/data/

Tests: node --test tools/check.test.mjs tools/learning.test.mjs tools/learning-render.test.mjs tools/quiz.test.mjs
Native and sync checks: python tools/check-native.py
All reference exercises: python tools/audit-exercises.py
Windows audio: node tools/export-audio.mjs

The studio opens without Python. Practice in the static browser version needs its initial Pyodide download; native practice avoids it. Studio search and evidence notes work without a model. Ollama is optional and no model is downloaded automatically. The Node bridge uses only the loopback Ollama endpoint.

Android: copy exported audio files to a media player for background playback. Browser narration can be interrupted by phone locking. Publish the static source files to your Pages course folder before expecting the new studio on the public URL. Audio is separate and should not be pushed as large Git files.

Studio and practice progress have separate backups. Studio can import practice lesson completion as evidence; verified mastery remains a user decision. No automatic sync. Imported text documents are session-only.

Preserve upstream and vendor licensing. No new top-level license is asserted. See the external REVIEW.html and START-HERE.html delivered alongside this source for the full review and setup instructions.

Version 4.2.0 adds Today, a 36-topic curriculum, projects, recall, evidence and quiz tests from 325 questions. Learning-plan backups include new quiz scores. Read REVIEW.html for the full 16-section report.
