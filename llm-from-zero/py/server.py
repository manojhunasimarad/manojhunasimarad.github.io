#!/usr/bin/env python3
"""LLM From Zero: the local app.

    python server.py              start it and open the browser
    python server.py --no-browser start it without opening a browser
    python server.py --port 9000  use another port

Everything runs on this computer. The server listens on 127.0.0.1 only, uses the Python
standard library only, and keeps your progress in data/progress.db next to this file.
"""

import html as html_lib
import http.server
import json
import mimetypes
import os
import platform
import random
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import agent  # noqa: E402
import engine  # noqa: E402
import mdlite  # noqa: E402
import papers  # noqa: E402
import runner  # noqa: E402
import sync  # noqa: E402

WEB = os.path.join(HERE, "web")
CONTENT = os.path.join(HERE, "content")
DATA = os.path.join(HERE, "data")
WORK = os.path.join(DATA, "work")
DB = os.path.join(DATA, "progress.db")
PAPERS = os.path.join(DATA, "papers")
ML_DIR = os.path.normpath(os.path.join(HERE, "..", "ml_practice", "problems"))
ML_Q = os.path.join(ML_DIR, "questions")
ML_REPO = "https://github.com/Open-Deep-ML/DML-OpenProblem.git"
ML_SITE = "https://www.deep-ml.com/problems/"
ML_ID_FIX = {"158_incremental-mean-for-online-reward-estimation": 159}
ML_QUIRKS = {
    128: "The expected text of test 2 has one extra pair of brackets. If your values match there, the problem is solved.",
    158: "Tests 2 and 3 depend on the exact order of random calls. If test 1 passes and your logic is right, the problem is solved.",
    19: "Return real numbers (use .real if the eigenvectors come back complex).",
}
TOKEN = secrets.token_urlsafe(24)
WEB_MODE = os.environ.get("LFZ_WEB") == "1"      # set by the browser version, which runs this file inside the browser
MIME = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
        ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf"}
LOCK = threading.Lock()


def read_json(name):
    with open(os.path.join(CONTENT, name), encoding="utf-8") as f:
        return json.load(f)


def read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


# ------------------------------------------------------------------ database

SCHEMA = """
create table if not exists attempts(ex text, ts integer, passed integer, total integer, changed integer);
create table if not exists solved(ex text primary key, ts integer);
create table if not exists hints(ex text primary key, level integer);
create table if not exists sol_views(ex text primary key, ts integer);
create table if not exists lessons(id text primary key, ts integer);
create table if not exists ticks(id text primary key, ts integer);
create table if not exists quiz(qid text, ts integer, correct integer, mode text);
create table if not exists settings(k text primary key, v text);
create table if not exists solves(ex text primary key, ts integer, hints integer, sol_seen integer, fails integer);
create table if not exists reviews(ex text, ts integer, ok integer, secs integer);
create table if not exists notes(id text primary key, v text, ts integer);
create table if not exists focus(id integer primary key autoincrement, ts integer, kind text, planned integer, secs integer, done integer, intent text, note text, ref text);
create table if not exists papers(id text primary key, ts integer, title text, source text, pages integer, chars integer, status text);
create table if not exists paper_notes(paper text, k text, v text, ts integer, primary key(paper, k));
create table if not exists nudges(ex text, ts integer);
create table if not exists recall(id integer primary key autoincrement, kind text, ref text, title text, made integer, step integer, due integer, note text, unique(kind, ref));
create table if not exists recall_log(card integer, ts integer, grade integer, gap integer, text text);
create index if not exists attempts_ex on attempts(ex);
create index if not exists quiz_qid on quiz(qid);
"""


def db():
    con = sqlite3.connect(DB, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    os.makedirs(WORK, exist_ok=True)
    with db() as con:
        con.executescript(SCHEMA)


def snapshot_solve(con, ex_id, ts):
    """Record how an exercise was solved: hints opened, solution seen and failed runs up to that moment."""
    row = con.execute("select level from hints where ex=?", (ex_id,)).fetchone()
    seen = con.execute("select 1 from sol_views where ex=? and ts<=?", (ex_id, ts)).fetchone()
    fails = con.execute("select count(*) c from attempts where ex=? and changed=1 and passed<total and ts<=?", (ex_id, ts)).fetchone()["c"]
    nudged = con.execute("select count(*) c from nudges where ex=? and ts<=?", (ex_id, ts)).fetchone()["c"]   # a nudge from the agent counts as a hint
    con.execute("insert or ignore into solves(ex, ts, hints, sol_seen, fails) values(?,?,?,?,?)",
                (ex_id, ts, min(3, (row["level"] if row else 0) + nudged), 1 if seen else 0, fails))


def migrate():
    """Bring a database from an earlier version up to date. Runs at every start and changes nothing twice."""
    with db() as con:
        for r in con.execute("select ex, ts from solved where ex not in (select ex from solves)").fetchall():
            snapshot_solve(con, r["ex"], r["ts"])
        version = C.manifest["version"]
        used = con.execute("select (select count(*) from attempts) + (select count(*) from lessons) + (select count(*) from ticks) + (select count(*) from quiz) c").fetchone()["c"]
        if setting(con, "seen_version", None) is None and not used:
            put_setting(con, "seen_version", version)      # a fresh install has nothing new to be told about
        if setting(con, "ticks_synced", "") != version:    # tick list rows whose exercise is already solved, once per version
            for r in con.execute("select ex, ts from solved").fetchall():
                for tid in C.rows_for.get(r["ex"], []):
                    con.execute("insert or ignore into ticks(id, ts) values(?, ?)", (tid, r["ts"]))
            put_setting(con, "ticks_synced", version)


def put_setting(con, key, value):
    con.execute("insert into settings(k, v) values(?, ?) on conflict(k) do update set v=excluded.v", (key, value))


def setting(con, key, default):
    row = con.execute("select v from settings where k=?", (key,)).fetchone()
    return row["v"] if row else default


def now():
    return int(time.time())


# ------------------------------------------------------------------ content

class Content:
    def __init__(self):
        self.lessons_doc = read_json("lessons.json")
        self.lessons = {l["id"]: l for l in self.lessons_doc["lessons"]}
        ex_doc = read_json("exercises.json")
        self.sets = ex_doc["sets"]
        self.local = ex_doc["exercises"]
        self.quiz = read_json("quiz.json")
        self.questions = {q["id"]: q for q in self.quiz["questions"]}
        self.lists = read_json("lists.json")
        self.certs = read_json("certs.json")
        self.skills_doc = read_json("skills.json")
        self.roles = read_json("roles.json")
        self.manifest = read_json("manifest.json")
        self.by_topic = {}
        for q in self.quiz["questions"]:
            self.by_topic.setdefault(q["topic"], []).append(q["id"])
        self.rows_for = {}      # exercise id -> the list rows that are about the same problem
        self.rows = {}          # list row id -> (list, title, first outside link)
        for key in self.lists["order"]:
            for it in list_items(self.lists[key]):
                if it.get("x"):
                    self.rows_for.setdefault(it["x"], []).append(it["i"])
            for st in self.lists[key]:
                for sb in st["subs"]:
                    for it in sb["items"]:
                        head = sb["t"] + ": " if sb.get("t") and key in ("papers", "replays", "build") else ""
                        link = sb.get("u") or next((p[1] for p in it.get("p", []) if len(p) > 1), "")
                        self.rows[it["i"]] = (key, (head + it["t"])[:200], link)
        self.watch = {it["i"]: it for it in list_items(self.lists.get("watch", []))}
        self.ml = []
        self.load_ml()
        self.reindex()

    def reindex(self):
        self.exercises = {e["id"]: e for e in self.local + self.ml}
        self.order = {s["id"]: [e["id"] for e in self.local + self.ml if e["set"] == s["id"]] for s in self.sets}
        self.titles = {i: e["title"] for i, e in self.exercises.items()}
        self.set_of = {i: e["set"] for i, e in self.exercises.items()}
        self.G = engine.Graph(self.skills_doc, self.exercises, self.lists.get("ml_plan", []))

    def ml_installed(self):
        return os.path.isdir(ML_Q)

    def load_ml(self):
        """Build the ML exercise list from the downloaded open problem set, if it is there."""
        self.ml = []
        if not self.ml_installed():
            return
        plan = self.lists.get("ml_plan", [])
        place = {}
        for bi, block in enumerate(plan):
            for pi, pid in enumerate(block["ids"]):
                place[pid] = (bi, pi, block["title"])
        found = []
        for folder in sorted(os.listdir(ML_Q)):
            m = re.match(r"(\d+)_(.+)", folder)
            meta_path = os.path.join(ML_Q, folder, "meta.json")
            if not m or not os.path.isfile(meta_path):
                continue
            try:
                meta = json.loads(read_text(meta_path))
            except ValueError:
                continue
            pid = ML_ID_FIX.get(folder, int(m.group(1)))
            bi, pi, unit = place.get(pid, (len(plan), pid, "More problems"))
            found.append(((bi, pi), {
                "id": "ml-%d" % pid, "set": "ml", "unit": unit, "n": pid, "dir": os.path.join(ML_Q, folder),
                "title": " ".join(str(meta.get("title", folder)).split()),
                "difficulty": str(meta.get("difficulty", "")).lower(),
                "tags": [str(meta.get("category", "")).title()],
            }))
        self.ml = [e for _k, e in sorted(found, key=lambda x: x[0])]

    def full(self, ex):
        """Return an exercise with statement, starter, tests, hints and solution loaded."""
        if ex["set"] != "ml":
            return ex
        d = ex["dir"]

        def opt(name):
            p = os.path.join(d, name)
            return read_text(p) if os.path.isfile(p) else ""

        statement = mdlite.render(opt("description.md"))
        try:
            e = json.loads(opt("example.json") or "{}")
        except ValueError:
            e = {}
        if e:
            statement += "<h4>Example</h4><pre><code>input:  %s\noutput: %s</code></pre>" % (
                mdlite.html.escape(str(e.get("input", ""))), mdlite.html.escape(str(e.get("output", ""))))
            if e.get("reasoning"):
                statement += "<p>%s</p>" % mdlite.inline(str(e["reasoning"]))
        if ex["n"] in ML_QUIRKS:
            statement += '<p class="note">Note: %s</p>' % mdlite.html.escape(ML_QUIRKS[ex["n"]])
        try:
            tests = json.loads(opt("tests.json") or "[]")
        except ValueError:
            tests = []
        learn = opt("learn.md")
        out = dict(ex)
        out.update({
            "statement": statement, "starter": opt("starter_code.py") or "# Write your solution here.\n",
            "tests": tests, "hints": [mdlite.render(learn)] if learn.strip() else [],
            "hint_label": "Theory notes", "solution": opt("solution.py"), "explanation": "",
            "link": ML_SITE + str(ex["n"]), "timeout": 30,
        })
        return out


C = None


# ------------------------------------------------------------------ helpers

def work_path(ex):
    safe = re.sub(r"[^A-Za-z0-9_\-]", "_", ex["id"])
    return os.path.join(WORK, ex["set"], safe + ".py")


def current_code(ex, full):
    p = work_path(ex)
    if os.path.isfile(p):
        return read_text(p)
    return full["starter"]


def statuses(con):
    solved = {r["ex"] for r in con.execute("select ex from solved")}
    tried = {r["ex"] for r in con.execute("select distinct ex from attempts")}
    return solved, tried


def status_of(ex_id, solved, tried):
    return "solved" if ex_id in solved else ("open" if ex_id in tried else "new")


def solution_unlocked(con, ex_id):
    if setting(con, "solutions", "after_attempt") == "always":
        return True
    if con.execute("select 1 from solved where ex=?", (ex_id,)).fetchone():
        return True
    return bool(con.execute("select 1 from attempts where ex=? and changed=1 limit 1", (ex_id,)).fetchone())


def activity(con):
    """Day number -> how many things were done that day (runs, lessons, ticks, quiz answers, rewrites)."""
    days = {}
    for table in ("attempts", "lessons", "ticks", "quiz", "reviews", "recall_log"):
        for r in con.execute("select ts from %s" % table):
            d = engine.ordinal(r["ts"])
            days[d] = days.get(d, 0) + 1
    for r in con.execute("select ts from focus where secs>=300"):       # a focus session of five minutes or more
        d = engine.ordinal(r["ts"])
        days[d] = days.get(d, 0) + 1
    return days


# ------------------------------------------------------------------ focus, reading shelf, agent

FOCUS = [
    {"id": "pomodoro", "name": "Pomodoro 25/5", "work": 25, "rest": 5, "about": "Short blocks. Good for starting, and for work you have been avoiding."},
    {"id": "fifty", "name": "50/10", "work": 50, "rest": 10, "about": "Long enough to hold a whole exercise in your head. A good default for coding."},
    {"id": "deep", "name": "Deep block 90/20", "work": 90, "rest": 20, "about": "One long block for a paper or a build stage. One a day is plenty."},
    {"id": "flow", "name": "Flowtime", "work": 0, "rest": 0, "about": "No bell. Work until your attention drops, then rest for a fifth of the time you worked."},
    {"id": "start5", "name": "Five-minute start", "work": 5, "rest": 0, "about": "For days when you do not want to begin. Promise five minutes. At the bell, stop or keep going."},
]
FOCUS_NAME = {k["id"]: k["name"] for k in FOCUS}
FOCUS_OPTIONS = {"focus_goal": "50", "focus_plan": "", "focus_intent": "1", "focus_next": "1", "focus_sound": "1", "focus_notify": "0", "focus_kind": "fifty"}
PAPER_KEYS = ("claim", "decision", "method", "unclear", "repro")


# ------------------------------------------------------------------ recall

# What the app asks when a row is ticked, by list. Lists that are not here do not ask; a note can still be added by hand.
RECALL_ASK = {
    "watch": "Close the video. From memory: the two or three ideas worth keeping.",
    "video": "Close the video. From memory: the idea that solves it, in two or three lines.",
    "papers": "Close the paper. From memory: what did you learn in this step?",
    "frontier": "Close the paper. From memory: what does it claim, and how does it show it?",
    "iv": "Without notes: explain it in four or five lines, the way you would say it in an interview.",
    "syl": "Without notes: explain it in four or five lines, the way you would in a viva. For a lab row: what did you measure, and what explained it?",
}
RECALL_BACK = {
    "watch": "Without opening it: which ideas from this were worth keeping?",
    "video": "Without opening it: what is the idea that solves it?",
    "papers": "Without opening the paper: what did you learn in this step?",
    "frontier": "Without opening it: what does it claim, and how does it show it?",
    "iv": "Without notes: explain it in four or five lines, the way you would say it in an interview.",
    "syl": "Without notes: explain it in four or five lines, the way you would in a viva.",
}
RECALL_DEFAULT = "From memory: what is worth keeping from this? Two or three lines."
RECALL_LESSON = "Without scrolling up: what did this lesson teach? Name each idea and give one example."
RECALL_OWN = ("row", "lesson", "own")     # kinds whose note the learner writes
NEEDS_OPTIONS = re.compile(r"\s*which (of these|of the following|statement)\b", re.I)


def recall_options(con):
    try:
        cap = max(1, min(40, int(setting(con, "recall_cap", str(engine.RECALL_A_DAY)))))
    except ValueError:
        cap = engine.RECALL_A_DAY
    return {"cap": cap, "ask": setting(con, "recall_ask", "1") == "1"}


def recall_when(row, today=None):
    if row["due"] is None:
        return "kept for a month"
    return engine.day_text(row["due"], today)


def recall_alive(row):
    """A card whose quiz question or lesson left the content in an update has nothing to show."""
    if row["kind"] == "quiz":
        return row["ref"] in C.questions
    if row["kind"] == "lesson":
        return row["ref"] in C.lessons
    return True


def recall_least(row):
    """The fewest characters that count as an attempt. A quiz answer can be one word; a note cannot."""
    return 1 if row["kind"] == "quiz" else 10


def recall_make(con, kind, ref, title, note=""):
    """Add a card that comes back tomorrow, or update the note of the one that exists. Returns its row."""
    tomorrow = engine.ordinal(time.time()) + engine.RECALL_DAYS[0]
    con.execute("insert into recall(kind, ref, title, made, step, due, note) values(?,?,?,?,0,?,?) "
                "on conflict(kind, ref) do update set title=excluded.title, note=case when excluded.note<>'' then excluded.note else recall.note end",
                (kind, ref, title[:200], now(), tomorrow, note))
    return con.execute("select * from recall where kind=? and ref=?", (kind, ref)).fetchone()


def recall_miss(con, qid):
    """A quiz question answered wrong comes back tomorrow as an open question. Returns False for one that needs its options."""
    q = C.questions[qid]
    if NEEDS_OPTIONS.match(plain(q["q"])):
        return False
    tomorrow = engine.ordinal(time.time()) + engine.RECALL_DAYS[0]
    con.execute("insert into recall(kind, ref, title, made, step, due, note) values('quiz',?,?,?,0,?,'') "
                "on conflict(kind, ref) do update set step=0, due=excluded.due", (qid, plain(q["q"]).strip()[:200], now(), tomorrow))
    return True


def recall_due(con, more=False):
    """(cards to do now, how many more are due but beyond today's number, how many were done today)."""
    today = engine.ordinal(time.time())
    due = [r for r in con.execute("select * from recall where due is not null and due<=? order by due, made, id", (today,)) if recall_alive(r)]
    done = con.execute("select count(distinct card) c from recall_log where ts>=?", (day_start(),)).fetchone()["c"]
    room = len(due) if more else max(0, recall_options(con)["cap"] - done)
    return due[:room], max(0, len(due) - room), done


def recall_view(con, row):
    """What the page needs to ask one card. The reference is not in here: it is sent after an attempt."""
    kind, ref = row["kind"], row["ref"]
    v = {"id": row["id"], "kind": kind, "title": row["title"], "step": row["step"], "when": recall_when(row),
         "label": "Your note", "prompt": "Without looking: what do you remember about this?", "link": "", "ext": "", "html": "", "code": "",
         "own": kind in RECALL_OWN, "least": recall_least(row)}
    if kind == "row":
        key, title, link = C.rows.get(ref, ("", row["title"], ""))
        v.update(label=C.lists.get("names", {}).get(key, "List"), title=title, link="#/lists/" + key if key else "", ext=link,
                 prompt=RECALL_BACK.get(key, v["prompt"]))
    elif kind == "lesson":
        v.update(label="Lesson", title=C.lessons[ref]["title"], link="#/lesson/" + ref,
                 prompt="Without opening it: what did this lesson teach? Name each idea and give one example.")
    elif kind == "paper":
        p = con.execute("select title from papers where id=?", (ref,)).fetchone()
        v.update(label="Paper", title=p["title"] if p else row["title"], link="#/paper/" + ref,
                 prompt="Without opening it: what does this paper claim, compared with what, and how is that shown?")
    elif kind == "quiz":
        q = C.questions[ref]
        topic = next((t["name"] for t in C.quiz["topics"] if t["id"] == q["topic"]), "Quiz")
        v.update(label="Quiz: " + topic, title="", html=q["q"], code=q.get("code", ""), prompt="Answer in a line or two. There are no options this time.")
    return v


def recall_reference(con, row):
    """What an attempt is compared with: a heading, labelled pieces of the learner's own text, or ready-made HTML."""
    if row["kind"] == "quiz":
        q = C.questions[row["ref"]]
        return {"head": "The answer", "parts": [], "html": "<p><strong>%s</strong></p><p>%s</p>" % (q["options"][q["answer"]], q["explain"])}
    if row["kind"] == "paper":
        notes = {x["k"]: x["v"] for x in con.execute("select k, v from paper_notes where paper=?", (row["ref"],))}
        names = (("claim", "What it claims"), ("method", "The method"), ("unclear", "What was unclear"), ("repro", "To reproduce it"))
        return {"head": "Your notes on this paper", "parts": [[label, notes[k]] for k, label in names if notes.get(k)], "html": ""}
    return {"head": "What you wrote before", "parts": [["", row["note"]]] if row["note"] else [], "html": ""}


def recall_brief(con):
    queue, waiting, done = recall_due(con)
    total = con.execute("select count(*) c from recall").fetchone()["c"]
    return {"due": len(queue), "waiting": waiting, "done_today": done, "cards": total}


def day_start():
    return int(time.mktime(time.localtime()[:3] + (0, 0, 0, 0, 0, -1)))


def focus_options(con):
    o = {k: setting(con, k, d) for k, d in FOCUS_OPTIONS.items()}
    try:
        goal = max(5, min(600, int(o["focus_goal"])))
    except ValueError:
        goal = 50
    return {"goal": goal, "plan": o["focus_plan"], "intent": o["focus_intent"] == "1", "next": o["focus_next"] == "1",
            "sound": o["focus_sound"] == "1", "notify": o["focus_notify"] == "1",
            "kind": o["focus_kind"] if o["focus_kind"] in FOCUS_NAME else "fifty"}


def focus_brief(con):
    """What Today shows about focus: minutes so far, the goal, and the note left at the end of the last session."""
    o = focus_options(con)
    secs = con.execute("select coalesce(sum(secs), 0) s from focus where ts>=?", (day_start(),)).fetchone()["s"]
    row = con.execute("select note, intent, ts from focus where note is not null and note<>'' order by ts desc limit 1").fetchone()
    note = None
    if row:
        note = {"note": row["note"], "intent": row["intent"] or "", "today": row["ts"] >= day_start()}
    return {"secs": secs, "goal": o["goal"], "plan": o["plan"], "kind": o["kind"], "note": note}


def agent_cfg(con):
    cfg = {"url": setting(con, "agent_url", agent.DEFAULT_URL), "model": setting(con, "agent_model", ""),
           "kind": setting(con, "agent_kind", "") or None}
    try:
        cfg["ctx"] = max(2048, min(262144, int(setting(con, "agent_ctx", str(agent.DEFAULT_CTX)))))
    except ValueError:
        cfg["ctx"] = agent.DEFAULT_CTX
    cfg["ready"] = bool(cfg["model"] and cfg["kind"])
    return cfg


def paper_stage(notes):
    return 3 if notes.get("repro") else 2 if notes.get("method") else 1 if notes.get("claim") else 0


def plain(html_text):
    return html_lib.unescape(re.sub(r"<[^>]+>", " ", html_text or ""))


def picture(con):
    """Everything the adaptive parts need, read in one go: exercise states, quiz answers, skill mastery."""
    st = engine.states(con, C.exercises)
    qs = quiz_stats(con)
    return st, qs, engine.mastery(C.G, st, qs, C.by_topic)


def suggestion(rec):
    """A recommendation, with what the page needs to show it."""
    if not rec:
        return None
    e = C.exercises[rec["id"]]
    sk = C.G.by_id.get(rec.get("skill"))
    return dict(rec, title=e["title"], set=e["set"], difficulty=e.get("difficulty", ""), skill_name=sk["name"] if sk else "")


def quiz_stats(con):
    """Per question: how many answers, and whether the latest answer was right."""
    stats = {}
    for r in con.execute("select qid, correct, ts from quiz order by ts"):
        s = stats.setdefault(r["qid"], {"n": 0, "right": 0, "last": 0})
        s["n"] += 1
        s["right"] += r["correct"]
        s["last"] = r["correct"]
    return stats


def list_items(track):
    return [it for st in track for sb in st["subs"] for it in sb["items"]]


# ------------------------------------------------------------------ api

class Api:
    def home(self, _q):
        with db() as con:
            solved, tried = statuses(con)
            read = {r["id"] for r in con.execute("select id from lessons")}
            ticks = {r["id"] for r in con.execute("select id from ticks")}
            st, qs, mast = picture(con)
            days = activity(con)
            seen_version = setting(con, "seen_version", None)
        today = engine.ordinal(time.time())
        cur, best = engine.streaks(set(days))
        recs = {s["id"]: suggestion(engine.recommend(C.G, st, mast, C.titles, s["id"], C.set_of)) for s in C.sets}
        due = engine.reviews_due(C.G, st, C.titles, today)
        reviews = [dict(d, title=C.titles[d["id"]], set=C.set_of[d["id"]]) for d in due[:engine.REVIEWS_A_DAY]]
        done_today = set()
        with db() as con:
            start = int(time.mktime(time.localtime()[:3] + (0, 0, 0, 0, 0, -1)))
            if con.execute("select 1 from reviews where ts>=? and ok=1 limit 1", (start,)).fetchone():
                done_today.add("review")
            if con.execute("select 1 from lessons where ts>=? limit 1", (start,)).fetchone():
                done_today.add("lesson")
            if con.execute("select 1 from quiz where ts>=? limit 1", (start,)).fetchone():
                done_today.add("quiz")
            for r in con.execute("select ex from solved where ts>=?", (start,)):
                if r["ex"] in C.set_of:
                    done_today.add(C.set_of[r["ex"]])
        news = None
        if seen_version != C.manifest["version"]:   # everything released since the version this learner last saw
            def parts(v):
                return tuple(int(x) for x in str(v).split(".") if x.isdigit())
            seen = parts(seen_version or "1.0.0")
            news = [e for e in C.manifest["changelog"] if parts(e["version"]) > seen] or None
        strong = sum(1 for m in mast.values() if m["state"] == "strong")
        sets = []
        for s in C.sets:
            ids = C.order[s["id"]]
            sets.append({"id": s["id"], "title": s["title"], "total": len(ids), "solved": sum(1 for i in ids if i in solved),
                         "next": next((i for i in ids if i not in solved), None)})
        lesson_ids = [l["id"] for l in C.lessons_doc["lessons"]]
        next_lesson = next((i for i in lesson_ids if i not in read), None)
        answered = [q for q in qs if q in C.questions]
        lists = {}
        for key in C.lists["order"]:
            items = list_items(C.lists[key])
            lists[key] = {"total": len(items), "done": sum(1 for it in items if it["i"] in ticks)}
        with db() as con:
            focus = focus_brief(con)
            recall = recall_brief(con)
            if recall["done_today"]:
                done_today.add("recall")
            shelf = []
            for r in con.execute("select id, title from papers order by ts"):
                notes = {x["k"]: x["v"] for x in con.execute("select k, v from paper_notes where paper=?", (r["id"],))}
                shelf.append({"id": r["id"], "title": r["title"], "stage": paper_stage(notes), "decision": notes.get("decision", "")})
        todo = [p for p in shelf if p["stage"] < 3 and p["decision"] != "skip"]
        reading = {"count": len(shelf), "next": min(todo, key=lambda p: p["stage"]) if todo else None}
        return {
            "focus": focus, "reading": reading, "recall": recall,
            "rec": recs, "reviews": reviews, "reviews_waiting": len(due), "done_today": sorted(done_today),
            "heat": [[d, days.get(d, 0)] for d in range(today - 83, today + 1)], "today": today, "best_streak": best,
            "weekday": engine.datetime.date.fromordinal(today).weekday(),
            "news": news, "skills": {"strong": strong, "total": len(mast)},
            "sets": sets,
            "lessons": {"total": len(lesson_ids), "read": len([i for i in lesson_ids if i in read]),
                        "next": next_lesson, "next_title": C.lessons[next_lesson]["title"] if next_lesson else None},
            "next_titles": {s["id"]: (C.exercises[s["next"]]["title"] if s["next"] else None) for s in sets},
            "quiz": {"total": len(C.questions), "answered": len(answered),
                     "right": sum(1 for q in answered if qs[q]["last"]),
                     "missed": sum(1 for q in answered if not qs[q]["last"])},
            "lists": lists, "streak": cur, "active_today": today in days,
            "ml_installed": C.ml_installed(), "version": C.manifest["version"],
        }

    def learn(self, _q):
        with db() as con:
            solved, _tried = statuses(con)
            read = {r["id"] for r in con.execute("select id from lessons")}
        courses = []
        for c in C.lessons_doc["courses"]:
            lessons = []
            for lid in c["lessons"]:
                l = C.lessons[lid]
                exs = l.get("exercises", [])
                lessons.append({"id": lid, "title": l["title"], "minutes": l.get("minutes"), "read": lid in read,
                                "ex_total": len(exs), "ex_solved": sum(1 for e in exs if e in solved)})
            courses.append({"id": c["id"], "title": c["title"], "when": c.get("when"), "blurb": c.get("blurb"),
                            "lessons": lessons, "soon": c.get("soon")})
        return {"courses": courses}

    def lesson(self, q):
        l = C.lessons.get(q.get("id", ""))
        if not l:
            raise NotFound("No such lesson.")
        ids = [x["id"] for x in C.lessons_doc["lessons"]]
        i = ids.index(l["id"])
        with db() as con:
            solved, tried = statuses(con)
            read = bool(con.execute("select 1 from lessons where id=?", (l["id"],)).fetchone())
            card = con.execute("select * from recall where kind='lesson' and ref=?", (l["id"],)).fetchone()
            ask = recall_options(con)["ask"]
        exs = [{"id": e, "title": C.exercises[e]["title"], "status": status_of(e, solved, tried)}
               for e in l.get("exercises", []) if e in C.exercises]
        return {"id": l["id"], "title": l["title"], "html": l["html"], "minutes": l.get("minutes"), "read": read,
                "recall": {"id": card["id"], "when": recall_when(card)} if card else None, "ask": ask, "ask_text": RECALL_LESSON,
                "exercises": exs, "prev": ids[i - 1] if i > 0 else None, "next": ids[i + 1] if i + 1 < len(ids) else None}

    def lesson_read(self, body):
        if body.get("id") not in C.lessons:
            raise NotFound("No such lesson.")
        with db() as con:
            if body.get("on", True):
                con.execute("insert or ignore into lessons(id, ts) values(?, ?)", (body["id"], now()))
            else:
                con.execute("delete from lessons where id=?", (body["id"],))
        return {"ok": True}

    def sets(self, _q):
        with db() as con:
            solved, _tried = statuses(con)
        return {"sets": [dict(s, total=len(C.order[s["id"]]), solved=sum(1 for i in C.order[s["id"]] if i in solved))
                         for s in C.sets], "ml_installed": C.ml_installed()}

    def exercises(self, q):
        sid = q.get("set", "python")
        if sid not in C.order:
            raise NotFound("No such set.")
        with db() as con:
            solved, tried = statuses(con)
        rows = []
        for i in C.order[sid]:
            e = C.exercises[i]
            rows.append({"id": i, "title": e["title"], "unit": e.get("unit", ""), "difficulty": e.get("difficulty", ""),
                         "n": e.get("n"), "tags": e.get("tags", []), "status": status_of(i, solved, tried),
                         "skill": C.G.skill_of.get(i)})
        with db() as con:
            st, _qs, mast = picture(con)
        rec = suggestion(engine.recommend(C.G, st, mast, C.titles, sid, C.set_of))
        return {"set": sid, "rows": rows, "ml_installed": C.ml_installed(), "rec": rec}

    def exercise(self, q):
        ex = C.exercises.get(q.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        full = C.full(ex)
        ids = C.order[ex["set"]]
        i = ids.index(ex["id"])
        with db() as con:
            level = con.execute("select level from hints where ex=?", (ex["id"],)).fetchone()
            level = level["level"] if level else 0
            is_solved = bool(con.execute("select 1 from solved where ex=?", (ex["id"],)).fetchone())
            attempts = con.execute("select count(*) c from attempts where ex=?", (ex["id"],)).fetchone()["c"]
            unlocked = solution_unlocked(con, ex["id"])
            st = engine.states(con, {ex["id"]: ex}).get(ex["id"])
            nudges = con.execute("select count(*) c from nudges where ex=?", (ex["id"],)).fetchone()["c"]
            agent_ready = agent_cfg(con)["ready"]
        lesson = full.get("lesson")
        sk = C.G.by_id.get(C.G.skill_of.get(ex["id"]))
        today = engine.ordinal(time.time())
        review = None
        if st and st["solved"]:
            review = {"passes": st["passes"], "of": len(engine.REVIEW_DAYS), "due": st["due"] is not None and st["due"] <= today,
                      "when": engine.day_text(st["due"], today), "done": st["due"] is None}
        if q.get("review"):
            if not is_solved:
                return {"id": ex["id"], "mode": "review", "unsolved": True}
            return {
                "id": ex["id"], "set": ex["set"], "title": ex["title"], "unit": ex.get("unit", ""),
                "difficulty": ex.get("difficulty", ""), "n": ex.get("n"), "statement": full["statement"],
                "code": full["starter"], "starter": full["starter"], "tests": len(full["tests"]), "review": review,
                "given": full.get("given", ""),
                "skill": {"id": sk["id"], "name": sk["name"]} if sk else None, "mode": "review",
            }
        return {
            "review": review, "nudges": nudges, "agent": agent_ready, "given": full.get("given", ""),
            "skill": {"id": sk["id"], "name": sk["name"], "step": C.G.level.get(ex["id"]) if sk["kind"] == "ex" else None} if sk else None,
            "then": ({"id": C.G.then[ex["id"]], "title": C.titles[C.G.then[ex["id"]]]}
                     if C.G.then.get(ex["id"]) in C.titles else None),
            "id": ex["id"], "set": ex["set"], "title": ex["title"], "unit": ex.get("unit", ""),
            "difficulty": ex.get("difficulty", ""), "n": ex.get("n"), "tags": ex.get("tags", []),
            "statement": full["statement"], "code": current_code(ex, full), "starter": full["starter"],
            "tests": len(full["tests"]), "sample": [{"ran": t.get("test", ""), "expected": t.get("expected_output", "")} for t in full["tests"][:1]],
            "hints_total": len(full["hints"]), "hints": full["hints"][:level], "hint_label": full.get("hint_label", "Hint"),
            "solved": is_solved, "attempts": attempts, "solution_unlocked": unlocked, "has_solution": bool(full.get("solution")),
            "prev": ids[i - 1] if i > 0 else None, "next": ids[i + 1] if i + 1 < len(ids) else None,
            "lesson": {"id": lesson, "title": C.lessons[lesson]["title"]} if lesson in C.lessons else None,
            "link": full.get("link"), "file": os.path.relpath(work_path(ex), HERE).replace(os.sep, "/"),
            "explanation": full.get("explanation", "") if is_solved else "",
        }

    def run(self, body):
        ex = C.exercises.get(body.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        full = C.full(ex)
        code = str(body.get("code", ""))
        if len(code) > 200000:
            raise Bad("That file is too large.")
        if body.get("review"):
            return self.run_review(ex, full, code, body)
        p = work_path(ex)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(code if code.endswith("\n") else code + "\n")
        results = runner.run_tests(code, full["tests"], seconds=full.get("timeout", 6), given=full.get("given", ""))
        passed = sum(1 for r in results if r["ok"])
        changed = int(code.strip() != full["starter"].strip())
        all_ok = bool(results) and passed == len(results)
        nxt = harder = how = None
        with db() as con:
            first = all_ok and not con.execute("select 1 from solved where ex=?", (ex["id"],)).fetchone()
            con.execute("insert into attempts(ex, ts, passed, total, changed) values(?,?,?,?,?)",
                        (ex["id"], now(), passed, len(results), changed))
            if all_ok:
                con.execute("insert or ignore into solved(ex, ts) values(?, ?)", (ex["id"], now()))
                snapshot_solve(con, ex["id"], now())
                if first:
                    for tid in C.rows_for.get(ex["id"], []):
                        con.execute("insert or ignore into ticks(id, ts) values(?, ?)", (tid, now()))
            unlocked = solution_unlocked(con, ex["id"])
            st, _qs, mast = picture(con)
        mine = st.get(ex["id"])
        if all_ok or (mine and mine["fails"] >= engine.STRUGGLE):
            rec = engine.recommend(C.G, st, mast, C.titles, ex["set"], C.set_of)
            if rec and rec["id"] != ex["id"]:
                nxt = suggestion(rec)
            elif rec and not all_ok:
                nxt = suggestion(rec)
        if all_ok and mine:
            t = C.G.then.get(ex["id"])
            if mine["clean"] and t in C.titles and not st.get(t, {}).get("solved") and (not nxt or nxt["id"] != t):
                harder = {"id": t, "title": C.titles[t]}
            how = {"clean": mine["clean"], "help": engine.help_text(mine["help"]), "first": first,
                   "review": engine.day_text(mine["due"]) if mine["due"] is not None else ""}
        return {"results": results, "passed": passed, "total": len(results), "solved": all_ok,
                "solution_unlocked": unlocked, "explanation": full.get("explanation", "") if all_ok else "",
                "next": nxt, "harder": harder, "how": how}

    def run_review(self, ex, full, code, body):
        """A rewrite from memory. The saved solution file is left alone and nothing counts as an attempt."""
        results = runner.run_tests(code, full["tests"], seconds=full.get("timeout", 6), given=full.get("given", ""))
        passed = sum(1 for r in results if r["ok"])
        all_ok = bool(results) and passed == len(results)
        out = {"results": results, "passed": passed, "total": len(results), "solved": all_ok, "counted": False, "when": ""}
        if not all_ok:
            return out
        today = engine.ordinal(time.time())
        secs = max(0, min(int(body.get("secs") or 0), 86400))
        with db() as con:
            st = engine.states(con, {ex["id"]: ex}).get(ex["id"])
            if st and st["due"] is not None and st["due"] <= today:
                con.execute("insert into reviews(ex, ts, ok, secs) values(?,?,1,?)", (ex["id"], now(), secs))
                st = engine.states(con, {ex["id"]: ex})[ex["id"]]
                out.update(counted=True, passes=st["passes"], of=len(engine.REVIEW_DAYS),
                           when=engine.day_text(st["due"], today), done=st["due"] is None)
            elif st:
                out.update(when=engine.day_text(st["due"], today), passes=st["passes"], of=len(engine.REVIEW_DAYS), done=st["due"] is None)
        return out

    def review_giveup(self, body):
        ex = C.exercises.get(body.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        with db() as con:
            con.execute("insert into reviews(ex, ts, ok, secs) values(?,?,0,0)", (ex["id"], now()))
        return {"ok": True}

    def reset(self, body):
        ex = C.exercises.get(body.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        p = work_path(ex)
        if os.path.isfile(p):
            os.replace(p, p + ".bak")
        return {"code": C.full(ex)["starter"]}

    def mark(self, body):
        """Mark an exercise solved by hand (for the few problems with a faulty test), or clear it."""
        ex = C.exercises.get(body.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        with db() as con:
            if body.get("on", True):
                con.execute("insert or ignore into solved(ex, ts) values(?, ?)", (ex["id"], now()))
                snapshot_solve(con, ex["id"], now())
            else:
                con.execute("delete from solved where ex=?", (ex["id"],))
                con.execute("delete from solves where ex=?", (ex["id"],))
        return {"ok": True}

    def hint(self, body):
        ex = C.exercises.get(body.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        full = C.full(ex)
        with db() as con:
            row = con.execute("select level from hints where ex=?", (ex["id"],)).fetchone()
            level = min((row["level"] if row else 0) + 1, len(full["hints"]))
            con.execute("insert into hints(ex, level) values(?, ?) on conflict(ex) do update set level=excluded.level",
                        (ex["id"], level))
        return {"hints": full["hints"][:level], "hints_total": len(full["hints"])}

    def solution(self, q):
        ex = C.exercises.get(q.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        full = C.full(ex)
        with db() as con:
            if not solution_unlocked(con, ex["id"]):
                raise Forbidden("Run an attempt of your own first. The solution unlocks after that.")
            con.execute("insert or ignore into sol_views(ex, ts) values(?, ?)", (ex["id"], now()))
        return {"solution": full.get("solution", ""), "explanation": full.get("explanation", "")}

    # ---- quiz

    def quiz_meta(self, _q):
        with db() as con:
            qs = quiz_stats(con)
        topics = []
        for t in C.quiz["topics"]:
            ids = [q["id"] for q in C.quiz["questions"] if q["topic"] == t["id"]]
            ans = [i for i in ids if i in qs]
            topics.append({"id": t["id"], "name": t["name"], "total": len(ids), "answered": len(ans),
                           "right": sum(1 for i in ans if qs[i]["last"])})
        missed = [i for i in qs if i in C.questions and not qs[i]["last"]]
        return {"topics": topics, "missed": len(missed), "total": len(C.questions)}

    def _pool(self, scope):
        kind, _, value = str(scope or "all").partition(":")
        qs = C.quiz["questions"]
        if kind == "topic":
            return [q for q in qs if q["topic"] == value]
        if kind == "cert":
            cert = next((c for c in C.certs["certs"] if c["id"] == value), None)
            if not cert:
                raise NotFound("No such certificate.")
            return [q for q in qs if q["topic"] in cert.get("topics", [])]
        if kind == "missed":
            with db() as con:
                st = quiz_stats(con)
            return [q for q in qs if q["id"] in st and not st[q["id"]]["last"]]
        return list(qs)

    def quiz_start(self, body):
        pool = self._pool(body.get("scope"))
        n = max(1, min(int(body.get("n", 10)), 100))
        with db() as con:
            st = quiz_stats(con)
        rng = random.Random()
        fresh = [q for q in pool if q["id"] not in st]
        wrong = [q for q in pool if q["id"] in st and not st[q["id"]]["last"]]
        right = [q for q in pool if q["id"] in st and st[q["id"]]["last"]]
        for group in (fresh, wrong, right):
            rng.shuffle(group)
        chosen = (fresh + wrong + right)[:n] if body.get("mode") != "exam" else rng.sample(pool, min(n, len(pool)))
        out = []
        for q in chosen:
            order = list(range(len(q["options"])))
            rng.shuffle(order)
            out.append({"id": q["id"], "topic": q["topic"], "q": q["q"], "code": q.get("code", ""),
                        "options": [q["options"][i] for i in order], "order": order})
        return {"questions": out, "pool": len(pool)}

    def quiz_check(self, body):
        q = C.questions.get(body.get("qid", ""))
        if not q:
            raise NotFound("No such question.")
        choice = body.get("choice")
        correct = int(choice == q["answer"])
        back = False
        with db() as con:
            con.execute("insert into quiz(qid, ts, correct, mode) values(?,?,?,?)", (q["id"], now(), correct, "practice"))
            if not correct:
                back = recall_miss(con, q["id"])
        return {"correct": bool(correct), "answer": q["answer"], "explain": q["explain"], "recall": back}

    def quiz_grade(self, body):
        answers = body.get("answers", {})
        review, right, back = [], 0, 0
        with db() as con:
            for qid, choice in answers.items():
                q = C.questions.get(qid)
                if not q:
                    continue
                correct = int(choice == q["answer"])
                right += correct
                con.execute("insert into quiz(qid, ts, correct, mode) values(?,?,?,?)", (qid, now(), correct, "exam"))
                if not correct and recall_miss(con, qid):
                    back += 1
                review.append({"id": qid, "q": q["q"], "code": q.get("code", ""), "options": q["options"], "answer": q["answer"],
                               "choice": choice, "correct": bool(correct), "explain": q["explain"], "topic": q["topic"]})
        return {"right": right, "total": len(review), "review": review, "recalls": back}

    def certs(self, _q):
        with db() as con:
            qs = quiz_stats(con)
        out = []
        for c in C.certs["certs"]:
            ids = [q["id"] for q in C.quiz["questions"] if q["topic"] in c.get("topics", [])]
            ans = [i for i in ids if i in qs]
            out.append(dict(c, questions=len(ids), answered=len(ans), right=sum(1 for i in ans if qs[i]["last"])))
        return {"certs": out, "others": C.certs.get("others", []), "note": C.certs.get("note", ""),
                "topics": {t["id"]: t["name"] for t in C.quiz["topics"]}}

    # ---- lists

    def lists(self, _q):
        with db() as con:
            ticks = {r["id"]: r["ts"] for r in con.execute("select id, ts from ticks")}
            notes = {r["id"]: r["v"] for r in con.execute("select id, v from notes")}
            solved = {r["ex"] for r in con.execute("select ex from solved")}
            cards = {r["ref"]: {"id": r["id"], "when": recall_when(r)} for r in con.execute("select * from recall where kind='row'")}
            ask = recall_options(con)["ask"]
        return {"tracks": {k: C.lists[k] for k in C.lists["order"]}, "ticks": ticks, "order": C.lists["order"],
                "names": C.lists.get("names", {}), "about": C.lists.get("about", {}), "notes": notes,
                "solved": sorted(solved & set(C.rows_for)),
                "recall": cards, "ask": RECALL_ASK if ask else {}, "ask_default": RECALL_DEFAULT}

    def note(self, body):
        nid = str(body.get("id", ""))[:120]
        value = str(body.get("v", "")).strip()[:200]
        if not nid:
            raise Bad("Missing id.")
        with db() as con:
            if value:
                con.execute("insert into notes(id, v, ts) values(?,?,?) on conflict(id) do update set v=excluded.v, ts=excluded.ts", (nid, value, now()))
            else:
                con.execute("delete from notes where id=?", (nid,))
        return {"ok": True}

    # ---- map, skills, roles

    def map(self, _q):
        with db() as con:
            st, _qs, mast = picture(con)
        out = []
        for sk in C.G.skills:
            m = mast[sk["id"]]
            out.append({"id": sk["id"], "name": sk["name"], "group": sk["group"], "at": sk["at"], "needs": sk["needs"],
                        "kind": sk["kind"], "about": sk.get("about", ""), "mastery": round(m["m"], 3), "state": m["state"],
                        "done": m["done"], "total": m["total"]})
        rec = suggestion(engine.recommend(C.G, st, mast, C.titles, None, C.set_of))
        return {"skills": out, "groups": C.skills_doc["groups"], "cols": C.skills_doc["cols"], "rows": C.skills_doc["rows"],
                "rec": rec, "ml_installed": C.ml_installed()}

    def skill(self, q):
        sk = C.G.by_id.get(q.get("id", ""))
        if not sk:
            raise NotFound("No such skill.")
        with db() as con:
            st, qs, mast = picture(con)
            ticked = {r["id"] for r in con.execute("select id from ticks")}
        watch = [dict(C.watch[i], done=i in ticked) for i in C.skills_doc.get("watch", {}).get(sk["id"], []) if i in C.watch]
        today = engine.ordinal(time.time())
        sc = engine.scores(C.G, st)
        rows = []
        for ex_id, lv in sk["ladder"]:
            e, s = C.exercises[ex_id], st.get(ex_id)
            row = {"id": ex_id, "title": e["title"], "step": lv, "difficulty": e.get("difficulty", ""), "n": e.get("n"),
                   "status": "solved" if s and s["solved"] else "open" if s and s["runs"] else "new", "score": round(sc[ex_id], 2),
                   "how": "", "review": ""}
            if s and s["solved"]:
                row["how"] = "without help" if s["clean"] else "with " + engine.help_text(s["help"]) if engine.help_text(s["help"]) else "solved"
                row["review"] = ("rewritten %d of %d times" % (s["passes"], len(engine.REVIEW_DAYS)) if s["due"] is None
                                 else "rewrite " + engine.day_text(s["due"], today))
                row["due"] = s["due"] is not None and s["due"] <= today
            elif sc[ex_id]:
                row["how"] = "half credit: a harder one was solved without help"
            rows.append(row)
        m = mast[sk["id"]]

        def brief(i):
            return {"id": i, "name": C.G.by_id[i]["name"], "mastery": round(mast[i]["m"], 3), "state": mast[i]["state"]}

        rec = None
        if sk["kind"] != "quiz":
            mine = {i for i, _lv in sk["ladder"]}
            last = max((i for i in mine if i in st and st[i]["last"][0]), key=lambda i: st[i]["last"], default=None)
            sub = {i: s for i, s in st.items() if i in mine}
            r = engine.recommend(C.G, sub, mast, {i: C.titles[i] for i in mine}, None, C.set_of)
            rec = suggestion(r) if r and r["id"] in mine else None
            if rec and not last:
                rec["why"] = "The first step of this skill." if m["met"] else rec["why"]
        quiz = None
        if sk["kind"] == "quiz":
            ids = C.by_topic.get(sk["quiz"], [])
            quiz = {"topic": sk["quiz"], "total": len(ids), "answered": sum(1 for i in ids if i in qs),
                    "right": sum(1 for i in ids if qs.get(i, {}).get("last"))}
        return {"id": sk["id"], "name": sk["name"], "group": sk["group"], "kind": sk["kind"], "about": sk.get("about", ""),
                "mastery": round(m["m"], 3), "state": m["state"], "done": m["done"], "total": m["total"], "met": m["met"],
                "rows": rows, "needs": [brief(i) for i in sk["needs"]], "unlocks": [brief(i) for i in C.G.unlocks[sk["id"]]],
                "rec": rec, "quiz": quiz, "ml_installed": C.ml_installed(), "strong_at": engine.STRONG, "met_at": engine.MET,
                "watch": watch}

    def roles(self, _q):
        with db() as con:
            _st, qs, mast = picture(con)
            ticks = {r["id"] for r in con.execute("select id from ticks")}
        out = []
        for role in C.roles["roles"]:
            parts = []
            for p in role["parts"]:
                if p["kind"] == "skills":
                    v = sum(mast[i]["m"] for i in p["ids"]) / len(p["ids"])
                    note = "%d of %d skills strong" % (sum(1 for i in p["ids"] if mast[i]["state"] == "strong"), len(p["ids"]))
                elif p["kind"] == "quiz":
                    ids = [i for t in p["topics"] for i in C.by_topic.get(t, [])]
                    right = sum(1 for i in ids if qs.get(i, {}).get("last"))
                    v, note = (right / len(ids) if ids else 0.0), "%d of %d right" % (right, len(ids))
                else:
                    items = [it for si in p["stages"] for sb in C.lists[p["track"]][si]["subs"] for it in sb["items"]]
                    done = sum(1 for it in items if it["i"] in ticks)
                    v, note = (done / len(items) if items else 0.0), "%d of %d done" % (done, len(items))
                parts.append({"label": p["label"], "href": p["href"], "value": round(v, 3), "note": note})
            out.append({"id": role["id"], "name": role["name"], "main": role.get("main", False), "titles": role["titles"],
                        "what": role["what"], "brings": role["brings"], "rounds": role["rounds"], "project": role["project"],
                        "parts": parts, "ready": round(sum(p["value"] for p in parts) / len(parts), 3)})
        return {"roles": out, "search": C.roles["search"]}

    def tick(self, body):
        tid = str(body.get("id", ""))[:120]
        if not tid:
            raise Bad("Missing id.")
        with db() as con:
            if body.get("on"):
                con.execute("insert or ignore into ticks(id, ts) values(?, ?)", (tid, now()))
            else:
                con.execute("delete from ticks where id=?", (tid,))
        return {"ok": True}

    # ---- focus

    def focus(self, _q):
        with db() as con:
            o = focus_options(con)
            start = day_start()
            today = [dict(r) for r in con.execute("select id, ts, kind, planned, secs, done, intent, note from focus where ts>=? order by ts", (start,))]
            since = now() - 14 * 86400
            stats = {}
            for r in con.execute("select kind, secs, done from focus where ts>=?", (since,)):
                k = stats.setdefault(r["kind"], {"started": 0, "finished": 0, "secs": 0})
                k["started"] += 1
                k["finished"] += 1 if r["done"] else 0
                k["secs"] += r["secs"] or 0
            total = con.execute("select count(*) c, coalesce(sum(secs), 0) s from focus where secs>0").fetchone()
            st, _qs, mast = picture(con)
            read = {r["id"] for r in con.execute("select id from lessons")}
            recalls = recall_brief(con)["due"]
        for row in today:
            row["name"] = FOCUS_NAME.get(row["kind"], row["kind"])
        table = [{"id": k["id"], "name": k["name"], "started": stats.get(k["id"], {}).get("started", 0),
                  "finished": stats.get(k["id"], {}).get("finished", 0), "mins": round(stats.get(k["id"], {}).get("secs", 0) / 60)} for k in FOCUS]
        tried = [t for t in table if t["started"] >= 3]
        verdict = ""
        if len(tried) >= 2 and sum(t["started"] for t in tried) >= 8:
            best = max(tried, key=lambda t: (t["finished"] / t["started"], t["mins"]))
            verdict = "Over the last 14 days you finished %s." % ", and ".join(
                "%d of %d sessions of %s" % (t["finished"], t["started"], t["name"]) for t in sorted(tried, key=lambda t: -t["finished"] / t["started"]))
            verdict += " %s is the one you finish most often." % best["name"]
        # a first line for the intention box: whatever Today would have you do first
        due = engine.reviews_due(C.G, st, C.titles)
        suggest = ""
        if recalls:
            suggest = "Recall: %d %s from earlier" % (recalls, "thing" if recalls == 1 else "things")
        elif due:
            suggest = "Rewrite from memory: " + C.titles[due[0]["id"]]
        else:
            nxt = next((l for l in C.lessons_doc["lessons"] if l["id"] not in read), None)
            rec = engine.recommend(C.G, st, mast, C.titles, "python", C.set_of) or engine.recommend(C.G, st, mast, C.titles, "dsa", C.set_of)
            if nxt and not any(s["solved"] for s in st.values()):
                suggest = "Read: " + nxt["title"]
            elif rec:
                suggest = "Solve: " + C.titles[rec["id"]]
        return {"kinds": FOCUS, "options": o, "today": {"secs": sum(r["secs"] or 0 for r in today), "sessions": today},
                "stats": table, "verdict": verdict, "all": {"sessions": total["c"], "mins": round(total["s"] / 60)}, "suggest": suggest}

    def focus_start(self, body):
        kind = body.get("kind")
        if kind not in FOCUS_NAME:
            raise Bad("Unknown technique.")
        planned = next(k["work"] for k in FOCUS if k["id"] == kind) * 60
        with db() as con:
            cur = con.execute("insert into focus(ts, kind, planned, secs, done, intent, note, ref) values(?,?,?,0,0,?,'',?)",
                              (now(), kind, planned, str(body.get("intent", "")).strip()[:200], str(body.get("ref", ""))[:120]))
            put_setting(con, "focus_kind", kind)
            return {"id": cur.lastrowid, "ts": now()}

    def focus_end(self, body):
        try:
            fid, secs = int(body.get("id")), max(0, min(int(body.get("secs", 0)), 6 * 3600))
        except (TypeError, ValueError):
            raise Bad("Bad session.")
        with db() as con:
            con.execute("update focus set secs=?, done=? where id=?", (secs, 1 if body.get("done") else 0, fid))
            return {"ok": True, "brief": focus_brief(con)}

    def focus_note(self, body):
        try:
            fid = int(body.get("id"))
        except (TypeError, ValueError):
            raise Bad("Bad session.")
        with db() as con:
            con.execute("update focus set note=? where id=?", (str(body.get("note", "")).strip()[:300], fid))
        return {"ok": True}

    def focus_set(self, body):
        key, value = "focus_" + str(body.get("k", "")), str(body.get("v", "")).strip()[:300]
        if key not in FOCUS_OPTIONS or key == "focus_kind":
            raise Bad("Unknown option.")
        if key in ("focus_intent", "focus_next", "focus_sound", "focus_notify"):
            value = "1" if value in ("1", "true", "True") else "0"
        with db() as con:
            put_setting(con, key, value)
            return {"ok": True, "options": focus_options(con)}

    # ---- reading shelf

    def papers(self, _q):
        with db() as con:
            rows = [dict(r) for r in con.execute("select id, ts, title, source, pages, chars, status from papers order by ts desc")]
            for r in rows:
                notes = {x["k"]: x["v"] for x in con.execute("select k, v from paper_notes where paper=?", (r["id"],))}
                r["stage"], r["decision"], r["claim"] = paper_stage(notes), notes.get("decision", ""), notes.get("claim", "")
            ready = agent_cfg(con)["ready"]
        try:
            import pypdf  # noqa: F401
            has_pypdf = True
        except ImportError:
            has_pypdf = False
        return {"papers": rows, "agent": ready, "can_extract": has_pypdf or bool(shutil.which("pdftotext"))}

    def _paper(self, con, pid):
        row = con.execute("select id, ts, title, source, pages, chars, status from papers where id=?", (str(pid),)).fetchone()
        if not row:
            raise NotFound("That paper is not on the shelf.")
        return dict(row)

    def paper(self, q):
        with db() as con:
            p = self._paper(con, q.get("id", ""))
            notes = {x["k"]: x["v"] for x in con.execute("select k, v from paper_notes where paper=?", (p["id"],))}
            cfg = agent_cfg(con)
            always = setting(con, "solutions", "after_attempt") == "always"
            card = con.execute("select * from recall where kind='paper' and ref=?", (p["id"],)).fetchone()
        try:
            qa = json.loads(notes.get("qa") or "[]")
        except ValueError:
            qa = []
        return dict(p, notes={k: notes.get(k, "") for k in PAPER_KEYS}, stage=paper_stage(notes),
                    file="/paper-file/%s.pdf" % p["id"], summary=mdlite.render(notes.get("agent_summary", "")) if notes.get("agent_summary") else "",
                    summary_by=notes.get("agent_summary_by", ""), qa=[{"q": x.get("q", ""), "html": mdlite.render(x.get("a", ""))} for x in qa][-12:],
                    agent=cfg["ready"], model=cfg["model"], unlocked=always or len(notes.get("claim", "").strip()) >= 20,
                    recall=recall_when(card) if card else "", has_file=os.path.isfile(os.path.join(PAPERS, p["id"] + ".pdf")))

    def _shelve(self, info, source):
        with db() as con:
            if not con.execute("select 1 from papers where id=?", (info["id"],)).fetchone():
                con.execute("insert into papers(id, ts, title, source, pages, chars, status) values(?,?,?,?,?,?,?)",
                            (info["id"], now(), info["title"], source[:500], info["pages"], info["chars"], info["status"]))
            else:
                con.execute("update papers set pages=?, chars=?, status=? where id=?", (info["pages"], info["chars"], info["status"], info["id"]))
        return {"id": info["id"], "title": info["title"], "status": info["status"]}

    def papers_add(self, body):
        url = str(body.get("url", "")).strip()
        if not url:
            raise Bad("Paste the address of a paper.")
        try:
            data, final = papers.fetch(url)
            info = papers.store(PAPERS, data, name_hint=str(body.get("title", "")), source=final)
        except papers.PaperError as e:
            raise Bad(str(e))
        if body.get("title"):
            info["title"] = str(body["title"]).strip()[:200]
        return self._shelve(info, final)

    def papers_store(self, data, name):
        try:
            info = papers.store(PAPERS, data, name_hint=name)
        except papers.PaperError as e:
            raise Bad(str(e))
        return self._shelve(info, "uploaded: " + name)

    def papers_note(self, body):
        key = body.get("k")
        if key not in PAPER_KEYS + ("title",):
            raise Bad("Unknown note.")
        value = str(body.get("v", "")).strip()[:6000]
        with db() as con:
            p = self._paper(con, body.get("id", ""))
            if key == "title":
                if value:
                    con.execute("update papers set title=? where id=?", (value[:200], p["id"]))
            elif value:
                con.execute("insert into paper_notes(paper, k, v, ts) values(?,?,?,?) on conflict(paper, k) do update set v=excluded.v, ts=excluded.ts",
                            (p["id"], key, value, now()))
            else:
                con.execute("delete from paper_notes where paper=? and k=?", (p["id"], key))
            notes = {x["k"]: x["v"] for x in con.execute("select k, v from paper_notes where paper=?", (p["id"],))}
            always = setting(con, "solutions", "after_attempt") == "always"
            card = None
            if len(notes.get("claim", "").strip()) >= 20:      # a paper with your claim written comes back in Recall
                title = con.execute("select title from papers where id=?", (p["id"],)).fetchone()["title"]
                card = recall_make(con, "paper", p["id"], title)
            when = recall_when(card) if card else ""
        return {"ok": True, "stage": paper_stage(notes), "unlocked": always or len(notes.get("claim", "").strip()) >= 20, "recall": when}

    def papers_delete(self, body):
        with db() as con:
            p = self._paper(con, body.get("id", ""))
            con.execute("delete from papers where id=?", (p["id"],))
            con.execute("delete from paper_notes where paper=?", (p["id"],))
            con.execute("delete from recall where kind='paper' and ref=?", (p["id"],))
        papers.remove(PAPERS, p["id"])
        return {"ok": True}

    # ---- recall

    def _card(self, con, cid):
        try:
            row = con.execute("select * from recall where id=?", (int(cid),)).fetchone()
        except (TypeError, ValueError):
            row = None
        if not row or not recall_alive(row):
            raise NotFound("No such recall card.")
        return row

    def recall(self, q):
        today = engine.ordinal(time.time())
        with db() as con:
            opts = recall_options(con)
            queue, waiting, done = recall_due(con, more=bool(q.get("more")))
            if q.get("card"):                      # one card, asked for by name, due or not
                queue, waiting = [self._card(con, q["card"])], 0
            rows = [r for r in con.execute("select * from recall order by (due is null), due, made, id") if recall_alive(r)]
            last = {r["card"]: r["grade"] for r in con.execute("select card, grade from recall_log order by ts, rowid")}
            logs = con.execute("select grade, gap from recall_log").fetchall()
            cfg = agent_cfg(con)
            views = [recall_view(con, r) for r in queue]
            cards = []
            for r in rows:
                v = recall_view(con, r)
                title = v["title"] or re.sub(r"\s+", " ", plain(v["html"])).strip()
                cards.append({"id": r["id"], "label": v["label"], "title": title if len(title) <= 120 else title[:117].rstrip() + "...", "when": v["when"],
                              "due": r["due"] is not None and r["due"] <= today, "kept": r["due"] is None, "last": last.get(r["id"])})
        ahead = min((r["due"] for r in rows if r["due"] is not None and r["due"] > today), default=None)
        week = [l for l in logs if l["gap"] >= 7]
        return {"queue": views, "waiting": waiting, "done_today": done, "options": opts, "cards": cards,
                "next": engine.day_text(ahead, today).replace("due ", "") if ahead else "",
                "stats": {"cards": len(rows), "kept": sum(1 for r in rows if r["due"] is None), "attempts": len(logs),
                          "week": {"tried": len(week), "all": sum(1 for l in week if l["grade"] == 2), "parts": sum(1 for l in week if l["grade"] == 1)}},
                "agent": cfg["ready"], "model": cfg["model"]}

    def recall_check(self, body):
        with db() as con:
            row = self._card(con, body.get("id"))
            return {"ref": recall_reference(con, row)}

    def recall_grade(self, body):
        text = str(body.get("text", "")).strip()[:4000]
        try:
            grade = max(0, min(2, int(body.get("grade", 0))))
        except (TypeError, ValueError):
            raise Bad("Bad grade.")
        today = engine.ordinal(time.time())
        with db() as con:
            row = self._card(con, body.get("id"))
            if len(text) < recall_least(row):
                grade = 0                              # nothing written counts as lost
            prev = con.execute("select max(ts) t from recall_log where card=?", (row["id"],)).fetchone()["t"] or row["made"]
            con.execute("insert into recall_log(card, ts, grade, gap, text) values(?,?,?,?,?)",
                        (row["id"], now(), grade, max(0, today - engine.ordinal(prev)), text))
            early = row["due"] is not None and row["due"] > today and grade == 2
            if early:
                step, due = row["step"], row["due"]    # recalling it before it is due proves nothing about the longer wait
            else:
                step, due = engine.recall_next(row["step"], grade, today)
            con.execute("update recall set step=?, due=? where id=?", (step, due, row["id"]))
            if body.get("keep") and row["kind"] in RECALL_OWN and len(text) >= recall_least(row):
                con.execute("update recall set note=? where id=?", (text, row["id"]))
            row = con.execute("select * from recall where id=?", (row["id"],)).fetchone()
            return {"ok": True, "step": step, "kept": due is None, "when": recall_when(row), "early": early}

    def recall_add(self, body):
        kind, note = body.get("kind"), str(body.get("note", "")).strip()[:4000]
        if kind not in RECALL_OWN:
            raise Bad("Unknown kind of note.")
        if len(note) < 10:
            raise Bad("Write at least a line, from memory.")
        ref = str(body.get("ref", ""))[:120]
        if kind == "row":
            if ref not in C.rows:
                raise NotFound("No such row.")
            title = C.rows[ref][1]
        elif kind == "lesson":
            if ref not in C.lessons:
                raise NotFound("No such lesson.")
            title = C.lessons[ref]["title"]
        else:
            title = str(body.get("title", "")).strip()[:200]
            if len(title) < 3:
                raise Bad("Give it a title, so you know what is being asked.")
            ref = "own-%d" % time.time_ns()
        with db() as con:
            row = recall_make(con, kind, ref, title, note)
            return {"ok": True, "id": row["id"], "when": recall_when(row)}

    def recall_note(self, body):
        note = str(body.get("note", "")).strip()[:4000]
        if len(note) < 10:
            raise Bad("Write at least a line.")
        with db() as con:
            row = self._card(con, body.get("id"))
            if row["kind"] not in RECALL_OWN:
                raise Bad("This card has no note of yours to change.")
            con.execute("update recall set note=? where id=?", (note, row["id"]))
        return {"ok": True}

    def recall_delete(self, body):
        with db() as con:
            row = self._card(con, body.get("id"))
            con.execute("delete from recall where id=?", (row["id"],))     # the attempts stay: they are the record of what was kept
        return {"ok": True}

    def recall_set(self, body):
        key, value = body.get("k"), str(body.get("v", "")).strip()
        with db() as con:
            if key == "cap":
                try:
                    put_setting(con, "recall_cap", str(max(1, min(40, int(value)))))
                except ValueError:
                    raise Bad("A number between 1 and 40.")
            elif key == "ask":
                put_setting(con, "recall_ask", "1" if value in ("1", "true", "True") else "0")
            else:
                raise Bad("Unknown option.")
            return {"ok": True, "options": recall_options(con)}

    # ---- the local agent

    def agent(self, _q):
        with db() as con:
            cfg = agent_cfg(con)
        return cfg

    def agent_config(self, body):
        url = agent.clean_base(str(body.get("url", "")) or agent.DEFAULT_URL)
        found = agent.detect(url)
        names = [m["name"] for m in found["models"]]
        model = str(body.get("model", "")).strip()
        with db() as con:
            put_setting(con, "agent_url", url)
            put_setting(con, "agent_kind", found["kind"] or "")
            if model and (model in names or not names):
                put_setting(con, "agent_model", model)
            elif not model and names and setting(con, "agent_model", "") not in names:
                put_setting(con, "agent_model", "")
            if body.get("ctx"):
                try:
                    put_setting(con, "agent_ctx", str(max(2048, min(262144, int(body["ctx"])))))
                except (TypeError, ValueError):
                    pass
            cfg = agent_cfg(con)
        return dict(cfg, models=found["models"], error=found["error"])

    def agent_test(self, _body):
        with db() as con:
            cfg = agent_cfg(con)
        if not cfg["ready"]:
            raise Bad("Choose a model first.")
        t0 = time.time()
        try:
            reply = agent.complete(cfg, [{"role": "user", "content": "Reply with the single word: ready"}])
        except agent.AgentError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "reply": reply[:120], "secs": round(time.time() - t0, 1)}

    def agent_check(self, _q):
        """What this computer has for running a model: GPUs, memory, and whether Ollama is installed."""
        out = {"gpus": [], "ollama": bool(shutil.which("ollama")), "system": platform.system(), "apple": False, "fits": "", "note": ""}
        smi = shutil.which("nvidia-smi")
        if smi:
            try:
                r = subprocess.run([smi, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20)
                for line in r.stdout.strip().splitlines():
                    name, _, mem = line.rpartition(",")
                    try:
                        out["gpus"].append({"name": name.strip(), "gb": round(float(mem) / 1024, 1)})
                    except ValueError:
                        pass
            except (OSError, subprocess.SubprocessError):
                pass
        if out["gpus"]:
            out["fits"] = agent.model_class(max(g["gb"] for g in out["gpus"]))
        elif platform.system() == "Darwin" and platform.machine() == "arm64":
            out["apple"] = True
            try:
                ram = int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=10).stdout.strip()) / 2 ** 30
                out["gpus"].append({"name": "Apple silicon, shared memory", "gb": round(ram, 1)})
                out["fits"] = agent.model_class(ram * 0.6)
                out["note"] = "On Apple silicon the model shares memory with everything else, so about 60% of it is counted."
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
        else:
            out["note"] = ("No NVIDIA GPU was found by nvidia-smi. A small model can still run on the processor, slowly. "
                           "If this laptop has a GPU, install its driver first.")
        return out

    def _for_agent(self, con, need_model=True):
        cfg = agent_cfg(con)
        if need_model and not cfg["ready"]:
            raise Bad("No local model is set up yet. Set one up under Settings.")
        return cfg

    def agent_summary(self, body):
        with db() as con:
            cfg = self._for_agent(con)
            p = self._paper(con, body.get("paper", ""))
            claim = con.execute("select v from paper_notes where paper=? and k='claim'", (p["id"],)).fetchone()
            if setting(con, "solutions", "after_attempt") != "always" and len((claim["v"] if claim else "").strip()) < 20:
                raise Forbidden("Write your own one-line claim first. The summary unlocks after that.")
        pages = papers.pages_of(PAPERS, p["id"])
        text = []
        for ev in agent.summary_events(cfg, pages, p["title"]):
            if ev["t"] == "delta":
                text.append(ev["text"])
            yield ev
        full = "".join(text).strip()
        with db() as con:
            for k, v in (("agent_summary", full), ("agent_summary_by", cfg["model"])):
                con.execute("insert into paper_notes(paper, k, v, ts) values(?,?,?,?) on conflict(paper, k) do update set v=excluded.v, ts=excluded.ts",
                            (p["id"], k, v, now()))
        yield {"t": "done", "html": mdlite.render(full), "by": cfg["model"]}

    def agent_ask(self, body):
        question = str(body.get("q", "")).strip()[:2000]
        if not question:
            raise Bad("Type a question.")
        with db() as con:
            cfg = self._for_agent(con)
            p = self._paper(con, body["paper"]) if body.get("paper") else None
        pages = papers.pages_of(PAPERS, p["id"]) if p else []
        if p and not pages:
            raise Bad("This paper has no text the agent can read.")
        history = body.get("history") if isinstance(body.get("history"), list) else []
        text = []
        for ev in agent.ask_events(cfg, pages, p["title"] if p else "", question, history):
            if ev["t"] == "delta":
                text.append(ev["text"])
            yield ev
        full = "".join(text).strip()
        if p:
            with db() as con:
                row = con.execute("select v from paper_notes where paper=? and k='qa'", (p["id"],)).fetchone()
                try:
                    qa = json.loads(row["v"]) if row else []
                except ValueError:
                    qa = []
                qa = (qa + [{"q": question, "a": full, "ts": now()}])[-30:]
                con.execute("insert into paper_notes(paper, k, v, ts) values(?,?,?,?) on conflict(paper, k) do update set v=excluded.v, ts=excluded.ts",
                            (p["id"], "qa", json.dumps(qa, ensure_ascii=False), now()))
        yield {"t": "done", "html": mdlite.render(full), "text": full}

    def agent_quiz(self, body):
        with db() as con:
            cfg = self._for_agent(con)
            p = self._paper(con, body.get("paper", ""))
        pages = papers.pages_of(PAPERS, p["id"])
        text = []
        for ev in agent.quiz_events(cfg, pages, p["title"]):
            if ev["t"] == "delta":
                text.append(ev["text"])
            yield ev
        full = "".join(text).strip()
        questions, _, answers = full.partition("\n---")
        yield {"t": "done", "html": mdlite.render(questions.strip()), "answers": mdlite.render(answers.strip(" -\n")) if answers.strip(" -\n") else ""}

    def agent_nudge(self, body):
        ex = C.exercises.get(body.get("id", ""))
        if not ex:
            raise NotFound("No such exercise.")
        full = C.full(ex)
        code = str(body.get("code", ""))[:200000]
        with db() as con:
            cfg = self._for_agent(con)
            if not con.execute("select 1 from attempts where ex=? and changed=1 limit 1", (ex["id"],)).fetchone():
                raise Forbidden("Run an attempt of your own first. A nudge needs something of yours to look at.")
        results = runner.run_tests(code, full["tests"], seconds=full.get("timeout", 6), given=full.get("given", ""))
        failing = next((r for r in results if not r["ok"]), None)
        if failing is None:
            yield {"t": "done", "html": "<p>Your code passes every test. Press Run tests.</p>", "counted": False}
            return
        with db() as con:
            con.execute("insert into nudges(ex, ts) values(?, ?)", (ex["id"], now()))
            count = con.execute("select count(*) c from nudges where ex=?", (ex["id"],)).fetchone()["c"]
        text = []
        for ev in agent.nudge_events(cfg, plain(full["statement"]), code, failing):
            if ev["t"] == "delta":
                text.append(ev["text"])
            yield ev
        yield {"t": "done", "html": mdlite.render("".join(text).strip()), "counted": True, "nudges": count}

    def agent_recall(self, body):
        attempt = str(body.get("text", "")).strip()[:4000]
        with db() as con:
            cfg = self._for_agent(con)
            row = self._card(con, body.get("id"))
            if len(attempt) < recall_least(row):
                raise Bad("Write your own attempt first.")
            view = recall_view(con, row)
            ref = recall_reference(con, row)
        reference = plain(ref["html"]) if ref["html"] else "\n".join((label + ": " if label else "") + text for label, text in ref["parts"])
        if not reference.strip():
            raise Bad("There is no earlier note to compare with.")
        title = view["title"] or plain(view["html"]).strip()
        if view["code"]:
            title += "\n" + view["code"]
        text = []
        for ev in agent.recall_events(cfg, title, reference, attempt):
            if ev["t"] == "delta":
                text.append(ev["text"])
            yield ev
        yield {"t": "done", "html": mdlite.render("".join(text).strip()), "by": cfg["model"]}

    # ---- settings and data

    def settings(self, _q):
        with db() as con:
            sync_info = {"exported": int(setting(con, "sync_exported", "0") or 0), "imported": int(setting(con, "sync_imported", "0") or 0)}
            return {"solutions": setting(con, "solutions", "after_attempt"), "python": sys.version.split()[0],
                    "data": DATA, "numpy": has_numpy(), "manifest": C.manifest, "root": os.path.dirname(HERE),
                    "mode": "web" if WEB_MODE else "local", "sync": sync_info}

    def settings_set(self, body):
        if body.get("k") == "seen_version":
            with db() as con:
                put_setting(con, "seen_version", C.manifest["version"])
            return {"ok": True}
        if body.get("k") != "solutions" or body.get("v") not in ("after_attempt", "always"):
            raise Bad("Unknown setting.")
        with db() as con:
            put_setting(con, body["k"], body["v"])
        return {"ok": True}

    def gpu(self, _q):
        """Look for PyTorch and a GPU with the Python that runs this app. Importing torch can take a while."""
        probe = ("import json\ntry:\n    import torch\nexcept Exception as e:\n    print(json.dumps({'torch': '', 'error': str(e)[:200]}))\n    raise SystemExit\n"
                 "out = {'torch': torch.__version__, 'cuda': bool(torch.cuda.is_available()), 'gpus': []}\n"
                 "if out['cuda']:\n    for i in range(torch.cuda.device_count()):\n        p = torch.cuda.get_device_properties(i)\n"
                 "        out['gpus'].append({'name': p.name, 'gb': round(p.total_memory / 2**30, 1)})\n"
                 "mps = getattr(torch.backends, 'mps', None)\nout['mps'] = bool(mps and mps.is_available())\nprint(json.dumps(out))\n")
        try:
            r = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True, timeout=90)
            return json.loads(r.stdout.strip().splitlines()[-1])
        except Exception as e:
            return {"torch": "", "error": "%s: %s" % (type(e).__name__, str(e)[:200])}

    def export(self, q):
        try:
            since = max(0, int(q.get("since") or 0))
        except ValueError:
            raise Bad("since must be a time in seconds.")
        with db() as con:
            data = sync.export(con, WORK, C.manifest["version"], since)
            put_setting(con, "sync_exported", str(now()))
        return data

    def import_progress(self, body):
        data = body.get("data")
        try:
            sync.check(data)
        except sync.SyncError as e:
            raise Bad(str(e))

        def resets(qid):
            q = C.questions.get(qid)
            return bool(q) and not NEEDS_OPTIONS.match(plain(q["q"]))
        with db() as con:
            added = sync.merge(con, data, WORK, C.rows_for, resets)
            put_setting(con, "sync_imported", str(now()))
        return {"ok": True, "added": added, "message": sync.describe(added)}

    def ml_install(self, _body):
        if C.ml_installed():
            return {"ok": True, "count": len(C.ml), "message": "The problems are already downloaded."}
        if shutil.which("git") is None:
            raise Bad("git is not installed. Install git, or download the ZIP of github.com/Open-Deep-ML/DML-OpenProblem "
                      "and unpack it so that this folder exists: %s" % ML_Q)
        with LOCK:
            os.makedirs(os.path.dirname(ML_DIR), exist_ok=True)
            cmds = [["git", "clone", "--quiet", "--depth", "1", "--filter=blob:none", "--sparse", ML_REPO, ML_DIR],
                    ["git", "-C", ML_DIR, "sparse-checkout", "set", "questions"]]
            ok = True
            log = ""
            for cmd in cmds:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                log += r.stderr[-600:]
                if r.returncode != 0:
                    ok = False
                    break
            if not ok:
                shutil.rmtree(ML_DIR, ignore_errors=True)
                r = subprocess.run(["git", "clone", "--depth", "1", ML_REPO, ML_DIR], capture_output=True, text=True, timeout=1800)
                if r.returncode != 0:
                    shutil.rmtree(ML_DIR, ignore_errors=True)
                    raise Bad("The download failed. Check your connection and try again.\n" + (r.stderr[-400:] or log))
            C.load_ml()
            C.reindex()
        return {"ok": True, "count": len(C.ml), "message": "Downloaded %d problems." % len(C.ml)}


def has_numpy():
    try:
        r = subprocess.run([sys.executable, "-c", "import numpy; print(numpy.__version__)"], capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


class NotFound(Exception):
    status = 404


class Bad(Exception):
    status = 400


class Forbidden(Exception):
    status = 403


GET = {"/api/home": "home", "/api/learn": "learn", "/api/lesson": "lesson", "/api/sets": "sets",
       "/api/exercises": "exercises", "/api/exercise": "exercise", "/api/solution": "solution",
       "/api/quiz": "quiz_meta", "/api/certs": "certs", "/api/lists": "lists", "/api/settings": "settings",
       "/api/export": "export", "/api/map": "map", "/api/skill": "skill", "/api/roles": "roles", "/api/gpu": "gpu",
       "/api/focus": "focus", "/api/papers": "papers", "/api/paper": "paper", "/api/agent": "agent", "/api/agent/check": "agent_check", "/api/recall": "recall"}
POST = {"/api/lesson/read": "lesson_read", "/api/run": "run", "/api/reset": "reset", "/api/hint": "hint",
        "/api/mark": "mark", "/api/quiz/start": "quiz_start", "/api/quiz/check": "quiz_check",
        "/api/quiz/grade": "quiz_grade", "/api/tick": "tick", "/api/settings": "settings_set",
        "/api/ml/install": "ml_install", "/api/note": "note", "/api/review/giveup": "review_giveup",
        "/api/focus/start": "focus_start", "/api/focus/end": "focus_end", "/api/focus/note": "focus_note", "/api/focus/set": "focus_set",
        "/api/papers/add": "papers_add", "/api/papers/note": "papers_note", "/api/papers/delete": "papers_delete",
        "/api/agent/config": "agent_config", "/api/agent/test": "agent_test",
        "/api/recall/check": "recall_check", "/api/recall/grade": "recall_grade", "/api/recall/add": "recall_add",
        "/api/recall/note": "recall_note", "/api/recall/delete": "recall_delete", "/api/recall/set": "recall_set",
        "/api/import": "import_progress"}
# These answer piece by piece, as the model writes: one JSON object per line.
STREAM = {"/api/agent/summary": "agent_summary", "/api/agent/ask": "agent_ask", "/api/agent/quiz": "agent_quiz", "/api/agent/nudge": "agent_nudge",
          "/api/agent/recall": "agent_recall"}
API = Api()


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "LLMFromZero/3"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):   # keep the terminal quiet
        pass

    def send(self, status, body, ctype="application/json; charset=utf-8", cache=False):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(data)

    def json(self, status, obj):
        self.send(status, json.dumps(obj, ensure_ascii=False))

    def local_only(self):
        """Refuse anything that did not come from this app's own page on this computer."""
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost"):
            return False
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            return False
        return True

    def api(self, table, payload):
        path = urllib.parse.urlparse(self.path).path
        name = table.get(path)
        if not name:
            return self.json(404, {"error": "Not found."})
        if not self.local_only() or not secrets.compare_digest(self.headers.get("X-Token") or "", TOKEN):
            return self.json(403, {"error": "This page is out of date. Reload it."})
        try:
            self.json(200, getattr(API, name)(payload))
        except (NotFound, Bad, Forbidden) as e:
            self.json(e.status, {"error": str(e)})
        except Exception as e:   # report the problem to the page instead of dropping the connection
            self.json(500, {"error": "%s: %s" % (type(e).__name__, e)})

    def allowed(self):
        return self.local_only() and secrets.compare_digest(self.headers.get("X-Token") or "", TOKEN)

    def stream(self, name, body):
        """Send what a generator yields, one JSON line at a time, so the page can show an answer as it is written."""
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        def put(ev):
            self.wfile.write((json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8"))
            self.wfile.flush()

        events = getattr(API, name)(body)
        try:
            for ev in events:
                put(ev)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass                                  # the page was closed; stop asking the model
        except (NotFound, Bad, Forbidden, agent.AgentError) as e:
            try:
                put({"t": "error", "text": str(e)})
            except OSError:
                pass
        except Exception as e:
            try:
                put({"t": "error", "text": "%s: %s" % (type(e).__name__, e)})
            except OSError:
                pass
        finally:
            events.close()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.startswith("/api/"):
            query = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
            return self.api(GET, query)
        if not self.local_only():
            return self.send(403, "Forbidden", "text/plain; charset=utf-8")
        m = re.fullmatch(r"/paper-file/([0-9a-f]{12})\.pdf", url.path)
        if m:
            path = os.path.join(PAPERS, m.group(1) + ".pdf")
            if not os.path.isfile(path):
                return self.send(404, "Not found", "text/plain; charset=utf-8")
            with open(path, "rb") as f:
                return self.send(200, f.read(), "application/pdf")
        rel = "index.html" if url.path in ("/", "") else url.path.lstrip("/")
        full = os.path.normpath(os.path.join(WEB, rel))
        if not full.startswith(WEB + os.sep) or not os.path.isfile(full):
            return self.send(404, "Not found", "text/plain; charset=utf-8")
        with open(full, "rb") as f:
            data = f.read()
        if rel == "index.html":
            data = data.replace(b"__TOKEN__", TOKEN.encode("ascii"))
            return self.send(200, data, "text/html; charset=utf-8")
        # Fixed types for the files this app serves. The system's own table can be wrong (on some
        # Windows machines .js is registered as text/plain, and the browser then refuses to run it).
        ctype = MIME.get(os.path.splitext(full)[1].lower()) or mimetypes.guess_type(full)[0] or "application/octet-stream"
        self.send(200, data, ctype, cache=rel.startswith("vendor/"))

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/api/papers/upload":      # the one request that is not JSON: the bytes of a PDF
            if not self.allowed():
                return self.json(403, {"error": "This page is out of date. Reload it."})
            if "application/pdf" not in (self.headers.get("Content-Type") or ""):
                return self.json(415, {"error": "Send a PDF."})
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if not 0 < length <= papers.MAX_BYTES:
                return self.json(413, {"error": "That file is empty or larger than 80 MB."})
            data = self.rfile.read(length)
            name = urllib.parse.parse_qs(url.query).get("name", ["paper.pdf"])[0][:200]
            try:
                return self.json(200, API.papers_store(data, name))
            except (NotFound, Bad, Forbidden) as e:
                return self.json(e.status, {"error": str(e)})
            except Exception as e:
                return self.json(500, {"error": "%s: %s" % (type(e).__name__, e)})
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return self.json(415, {"error": "Send JSON."})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > (80_000_000 if url.path == "/api/import" else 2_000_000):
                return self.json(413, {"error": "Too large."})
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return self.json(400, {"error": "Bad request."})
        if url.path in STREAM:
            if not self.allowed():
                return self.json(403, {"error": "This page is out of date. Reload it."})
            return self.stream(STREAM[url.path], body)
        self.api(POST, body)


def main():
    global C
    args = sys.argv[1:]
    port = 8765
    if "--port" in args:
        port = int(args[args.index("--port") + 1])
    init_db()
    C = Content()
    migrate()
    server = None
    for p in range(port, port + 20):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            continue
    if server is None:
        print("Could not find a free port near %d. Try: python server.py --port 9000" % port)
        sys.exit(1)
    url = "http://127.0.0.1:%d/" % port
    print("LLM From Zero %s is running at %s" % (C.manifest["version"], url))
    print("Your progress is saved in %s" % DB)
    print("Press Ctrl+C to stop.")
    if "--no-browser" not in args:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
