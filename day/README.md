# Dinachari (ದಿನಚರಿ)

One app for the day, at the root of <https://manojhunasimarad.github.io/>. It sits on top of the
other apps on this site and tracks what none of them do alone:

| Tab | What it does |
|---|---|
| Today | A 24-hour dial with the plan and last night’s sleep; now and next; “Going to sleep” and “I’m awake”; today’s three; Kitchen’s meals, soaking and shopping; habits; study steps; trading practice; the evening review |
| Cook | Meals today and tomorrow, prep ahead (soak, sprout, marinate, curd) with ticks and calendar reminders, shopping list to share, cooking timers, a stopwatch that times each dish against the book, ratings and “cook again?” |
| Learn | LLM From Zero’s five steps for today, study blocks today and tomorrow, study minutes this week, books you are reading |
| Trade | Dalal Dojo’s paper desk (worth, P&L, rank, missions), lessons and belt, practice days, one-line lessons learned |
| Me | Sleep (stats and 14 nights), weight from Kitchen, movement, a 14-day habit grid, the weekly review, past daily reviews |

The other apps keep working on their own: Dinachari opens them, it does not replace them.

## How it connects to the other apps

All the apps share one origin, so they share `localStorage`. Dinachari reads:

- **Kitchen From Zero**: `kfz.summary`, a small summary Kitchen writes for Dinachari after every change
  (`src/hub-summary.js` in the Kitchen repo), plus `kfz.state` for eaten ticks, weight and prep ticks.
  When the summary is old, Dinachari opens Kitchen in a hidden frame for a few seconds to refresh it.
  Ticking a prep task here writes `kfz.state.done[key]`, the same field Kitchen’s own tick box writes.
- **LLM From Zero**: its study clock routine and log, and today’s five steps, computed with its own
  modules (`journey-core.mjs`, `clock-core.mjs`) so the numbers always match. The routine is shared:
  change it in either app and the other follows.
- **Dalal Dojo**: `dojo.account` (desk) and `dalal-dojo-v1` (lessons and lab), read only.

Dinachari’s own data is `day.v1`: one record per thing (`sleep:2026-11-28`, `hab:2026-11-28:move`,
`rev:…`, `top3:…`, `cook:…`, `act:…`, `book:…`, `tnote:…`, `settings`), each with its change time `u`.

## Sync, backups, privacy

- Data stays in the browser on each device. Sync is optional: it uses the GitHub sign-in LLM From Zero
  already has (gist scope only) and keeps a separate secret gist, “Dinachari: daily sync”. Records merge
  item by item. Kitchen and Dojo data are synced as whole copies; if both devices changed one since the
  last sync, nothing is overwritten and you choose which copy to keep.
- Settings, Your data: a backup file of every app’s data on this site, without sign-in tokens or API keys.

## System services

- Installable on Android (Chrome) and Windows (Edge or Chrome), works offline (`/sw.js`), shortcuts on the
  icon: I’m awake, Going to sleep, New timer, Review today.
- Notifications with action buttons for wind-down, bedtime, the review, Kitchen prep and timers; timers
  chime, vibrate and keep the screen awake while cooking; the app badge counts what is due.
- A phone stops background web apps to save battery, so alarms that must ring with the app closed come
  from the calendar: Settings, Reminders, “Add the routine to my calendar (.ics)”, and the calendar
  button on each prep task.

## Development

No build step and no dependencies. Files: `index.html`, `manifest.webmanifest`, `sw.js` at the root;
everything else in `day/` (`core.mjs` rules, `sources.mjs` other apps, `sync.mjs`, `views.mjs`,
`dial.mjs`, `app.mjs`, `app.css`).

```
node --test "day/tests/*.test.mjs"   # rules, sources (with LLM From Zero's real modules), sync, cache version
node day/tools/stamp.mjs              # after any change: new cache version, so installed copies update
```
