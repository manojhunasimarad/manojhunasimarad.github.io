# Manoj OS

My day in one place, on my phone and laptop, offline, with no subscription.
Live at **https://manojhunasimarad.github.io/os/**

It replaces opening three apps with one screen that answers "what should I be doing right now?", and it's built from the best parts of them:
Kitchen From Zero (recipes, pantry, nutrition), LLM From Zero (Stage 0 Python exercises and recall questions) and Dalal Dojo (lessons, missions, Zerodha charges).
Those three stay live as libraries.

## What's in it

| Tab | What it does |
| --- | --- |
| **Now** | The current block of my week, time left, what's next, the small things inside it to tick off, and the whole day as a checklist. A sleep strip, today's three picks (one dish, one Python exercise, one trading step), protein, phone and laptop time, laundry timer, focus sessions, and the trip checklists the day before and after a trip. After bedtime everything locks behind a night screen. |
| **Cook** | One pick that fits the cook block I'm in (30 min mornings, 25 evenings, 60 for the Sunday special), my pantry, my protein target and variety. On office mornings it also picks the lunch box. Tuesday is a fast day: dinner picks only. Servings scale, missing items link to Instamart, and there's a protein log and a shopping list. |
| **Learn** | Stage 0 Python only, one exercise at a time with hints (written and tested in LLM From Zero on the laptop), 5 recall cards a day on the phone, a **Radar** of fresh papers, journals, repos and blog posts in my topics, and the bookshelf (one technical and one non-technical book). |
| **Trade** | Paper trades on the real market: plan with a stop and a reason, 1% risk sizing capped at capital, Zerodha charges on close, win rate, R and expectancy, missions checked against the journal, one lesson a day, CSV export for the algo bot. |
| **Life** | Balance of the week, sleep, screen time (phone by hand, laptop through ActivityWatch), health (lab results with food advice, test prep, recovery plans, my rules), home (chores, fix-it list, use/ignore, watchlist), trips, the weekly schedule editor, and settings (night blocking, silent-during-focus, calendar export, GitHub sync, backup). |

The roasts are pop-ups that know the time, the block and the device: phone after bedtime, Windows at all, phone in a study or office block, phone on the ride, short sleep, late alarm, wet laundry, last night's utensils, low protein, high screen time, broken streak.

## Files

```
index.html     layout and styles
content.js     everything about me: wake/bed, the week block by block, rules, kit, recovery plans, lab ranges, roasts  ← edit this
data.js        generated: recipes, pantry, Python exercises and quiz, trading lessons (don't edit by hand)
js/core.js     state, schedule engine, sleep, roast engine, notifications, laundry timer, GitHub sync, calendar export
js/now.js      Now tab and the night lock
js/cook.js     Cook tab
js/learn.js    Learn tab, recall, Radar, bookshelf
js/trade.js    Trade tab, charges, journal, missions
js/life.js     Life tab
js/boot.js     routing, taps, timers
sw.js, manifest.webmanifest, icons/   offline and home-screen install
tools/         rebuild data.js from the three source apps
```

## Changing things

- **Schedule, rules, roasts, lab ranges, books:** edit `content.js` on GitHub. Changes made inside the app (Life → Schedule → Edit) are saved on the device and override the file.
- **After editing any file:** bump `VERSION` in `sw.js` so phones pick up the new version.
- **Rebuilding data.js** (after the Kitchen or LLM From Zero content changes):

```bash
node tools/extract_dalal.js    ../dalal-dojo-lessons/index.html build/dalal_modules.json
node tools/extract_missions.js ../dalal-dojo/index.html         build/dalal_missions.json
python3 tools/build_data.py --kitchen ../../Kitchen --llm ../llm-from-zero --dalal build --out data.js
```

## Honest limits

- A web page can't read Android screen time or block other apps. The app asks for the Digital Wellbeing total (5 seconds), and Life → Settings has the setup for Focus mode (Android) and LeechBlock NG (Chrome on Windows) to block apps and sites overnight.
- Reminders fire only while the app is open. For reminders that always fire, import the `.ics` files into Google Calendar; the focus calendar can also switch the phone to Do Not Disturb.
- Laptop screen time needs ActivityWatch running with this site allowed in its CORS setting.
- Data lives in the browser on each device. Turn on GitHub sync (a private repo and a fine-grained token) to keep phone and laptop in step.
- Health figures are general information, not a diagnosis.
