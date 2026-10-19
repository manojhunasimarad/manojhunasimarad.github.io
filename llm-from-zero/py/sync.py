"""Moving progress between devices: one device exports a file, another imports it.

Importing adds what is new and never removes anything, so it can be done in either direction and
repeated: importing the same file twice changes nothing. Most of what the app records is a log of
events (runs, quiz answers, rewrites, recall attempts, focus sessions), and two logs merge by taking
both. The few tables that hold a current state are merged by a rule each:

    solved, solves, sol_views, lessons, ticks   the earliest time wins (it happened on some device)
    hints                                       the highest level wins
    notes, paper_notes                          the most recently written wins
    recall                                      the schedule is replayed from the merged attempts
    settings                                    only preferences this device does not have yet
    solution files                              the most recently saved wins

What an import cannot carry: something removed on one device (an unticked row, a deleted recall
card) comes back if the other device still has it. Paper PDFs are not in the file, only their
notes; upload the same PDF on the other device and the notes are already there.
"""

import json
import os
import time

import engine

FORMAT = 4
TABLES = ("attempts", "solved", "hints", "sol_views", "lessons", "ticks", "quiz", "settings", "solves", "reviews",
          "notes", "focus", "papers", "paper_notes", "nudges", "recall", "recall_log")
# Settings that describe this device, not the learner. They never travel.
LOCAL_SETTINGS = ("seen_version", "ticks_synced", "agent_url", "agent_model", "agent_kind", "agent_ctx", "sync_exported", "sync_imported")


def export(con, work_dir, content_version):
    tables = {t: [dict(r) for r in con.execute("select * from %s" % t)] for t in TABLES}
    work = {}
    if os.path.isdir(work_dir):
        for root, _dirs, files in os.walk(work_dir):
            for name in files:
                if not name.endswith(".py"):
                    continue
                path = os.path.join(root, name)
                rel = os.path.relpath(path, work_dir).replace(os.sep, "/")
                try:
                    with open(path, encoding="utf-8") as f:
                        work[rel] = {"code": f.read(), "mtime": int(os.path.getmtime(path))}
                except (OSError, UnicodeDecodeError):
                    continue
    return {"app": "llm-from-zero", "format": FORMAT, "version": 3, "content": content_version, "exported": int(time.time()),
            "tables": tables, "work": work}


class SyncError(Exception):
    pass


def _rows(data, table, cols):
    """The rows of one table from an imported file, with only the expected columns, or nothing."""
    out = []
    for r in data.get("tables", {}).get(table, []) or []:
        if isinstance(r, dict):
            out.append({c: r.get(c) for c in cols})
    return out


def _int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _str(v):
    return "" if v is None else str(v)


def check(data):
    if not isinstance(data, dict) or data.get("app") != "llm-from-zero" or not isinstance(data.get("tables"), dict):
        raise SyncError("That file is not a progress file from this app. On the other device, open Settings and press “Save my progress as a file”.")


def merge(con, data, work_dir, rows_for=None, quiz_resets=None):
    """Add what `data` holds and this database does not. Returns how much was added, by kind.

    rows_for: exercise id -> list rows that tick themselves when it is solved.
    quiz_resets: a function qid -> bool, whether a wrong answer to that question resets its recall card.
    """
    check(data)
    added = {}

    def count(kind, n=1):
        if n:
            added[kind] = added.get(kind, 0) + n

    # ---- logs: add every row this database does not have yet
    for table, cols, kind in (("attempts", ("ex", "ts", "passed", "total", "changed"), "runs"),
                              ("quiz", ("qid", "ts", "correct", "mode"), "quiz answers"),
                              ("reviews", ("ex", "ts", "ok", "secs"), "rewrites"),
                              ("nudges", ("ex", "ts"), "nudges")):
        have = {tuple(r) for r in con.execute("select %s from %s" % (", ".join(cols), table))}
        new = []
        for r in _rows(data, table, cols):
            row = tuple(_int(r[c]) if c in ("ts", "passed", "total", "changed", "correct", "ok", "secs") else _str(r[c]) for c in cols)
            if row[1] <= 0 or not row[0]:            # a row without a time or a subject is damaged: leave it out
                continue
            if row not in have:
                have.add(row)
                new.append(row)
        con.executemany("insert into %s(%s) values(%s)" % (table, ", ".join(cols), ", ".join("?" * len(cols))), new)
        count(kind, len(new))

    # ---- first time something happened: the earliest wins
    newly_solved = []
    for table, key, kind in (("solved", "ex", "exercises solved"), ("sol_views", "ex", None), ("lessons", "id", "lessons read"), ("ticks", "id", "list rows ticked")):
        have = {r[0]: r[1] for r in con.execute("select %s, ts from %s" % (key, table))}
        for r in _rows(data, table, (key, "ts")):
            k, ts = _str(r[key]), _int(r["ts"])
            if not k:
                continue
            if k not in have:
                con.execute("insert into %s(%s, ts) values(?, ?)" % (table, key), (k, ts))
                have[k] = ts
                if kind:
                    count(kind)
                if table == "solved":
                    newly_solved.append((k, ts))
            elif ts < have[k]:
                con.execute("update %s set ts=? where %s=?" % (table, key), (ts, k))
                have[k] = ts
    have = {r[0]: r[1] for r in con.execute("select ex, ts from solves")}
    for r in _rows(data, "solves", ("ex", "ts", "hints", "sol_seen", "fails")):
        k, ts = _str(r["ex"]), _int(r["ts"])
        vals = (ts, _int(r["hints"]), _int(r["sol_seen"]), _int(r["fails"]), k)
        if k and k not in have:
            con.execute("insert into solves(ts, hints, sol_seen, fails, ex) values(?,?,?,?,?)", vals)
        elif k and ts < have[k]:
            con.execute("update solves set ts=?, hints=?, sol_seen=?, fails=? where ex=?", vals)
    for ex, ts in newly_solved:                      # rows in the lists that stand for an exercise tick themselves
        for tid in (rows_for or {}).get(ex, []):
            con.execute("insert or ignore into ticks(id, ts) values(?, ?)", (tid, ts))
    have = {r[0]: r[1] for r in con.execute("select ex, level from hints")}
    for r in _rows(data, "hints", ("ex", "level")):
        k, lv = _str(r["ex"]), _int(r["level"])
        if k and lv > have.get(k, -1):
            con.execute("insert into hints(ex, level) values(?, ?) on conflict(ex) do update set level=excluded.level", (k, lv))

    # ---- written text: the most recent wins
    have = {r[0]: r[1] for r in con.execute("select id, ts from notes")}
    for r in _rows(data, "notes", ("id", "v", "ts")):
        k, ts = _str(r["id"]), _int(r["ts"])
        if k and ts > have.get(k, -1):
            con.execute("insert into notes(id, v, ts) values(?,?,?) on conflict(id) do update set v=excluded.v, ts=excluded.ts", (k, _str(r["v"]), ts))
            count("notes")
    have = {r[0] for r in con.execute("select id from papers")}
    for r in _rows(data, "papers", ("id", "ts", "title", "source", "pages", "chars", "status")):
        if r["id"] and _str(r["id"]) not in have:
            con.execute("insert into papers(id, ts, title, source, pages, chars, status) values(?,?,?,?,?,?,?)",
                        (_str(r["id"]), _int(r["ts"]), _str(r["title"]), _str(r["source"]), _int(r["pages"]), _int(r["chars"]), "elsewhere"))
            count("papers")
    have = {(r[0], r[1]): r[2] for r in con.execute("select paper, k, ts from paper_notes")}
    for r in _rows(data, "paper_notes", ("paper", "k", "v", "ts")):
        key, ts = (_str(r["paper"]), _str(r["k"])), _int(r["ts"])
        if key[0] and key[1] and ts > have.get(key, -1):
            con.execute("insert into paper_notes(paper, k, v, ts) values(?,?,?,?) on conflict(paper, k) do update set v=excluded.v, ts=excluded.ts",
                        (key[0], key[1], _str(r["v"]), ts))
            count("paper notes")

    # ---- settings: only preferences this device has not set
    have = {r[0] for r in con.execute("select k from settings")}
    for r in _rows(data, "settings", ("k", "v")):
        k = _str(r["k"])
        if k and k not in have and k not in LOCAL_SETTINGS and not k.startswith("agent_"):
            con.execute("insert into settings(k, v) values(?, ?)", (k, _str(r["v"])))

    # ---- focus sessions: the same session has the same start time and technique
    have = {(r["ts"], r["kind"]): r for r in con.execute("select id, ts, kind, secs, done, note from focus")}
    for r in _rows(data, "focus", ("ts", "kind", "planned", "secs", "done", "intent", "note", "ref")):
        key = (_int(r["ts"]), _str(r["kind"]))
        if key in have:
            mine = have[key]
            if _int(r["secs"]) > (mine["secs"] or 0) or (not mine["note"] and r["note"]):
                con.execute("update focus set secs=max(coalesce(secs, 0), ?), done=max(coalesce(done, 0), ?), note=coalesce(nullif(note, ''), ?) where id=?",
                            (_int(r["secs"]), _int(r["done"]), _str(r["note"]), mine["id"]))
            continue
        con.execute("insert into focus(ts, kind, planned, secs, done, intent, note, ref) values(?,?,?,?,?,?,?,?)",
                    (key[0], key[1], _int(r["planned"]), _int(r["secs"]), _int(r["done"]), _str(r["intent"]), _str(r["note"]), _str(r["ref"])))
        count("focus sessions")

    # ---- recall: cards are the same card when kind and ref match; their attempts are merged and the schedule replayed
    theirs = {_int(r["id"]): r for r in _rows(data, "recall", ("id", "kind", "ref", "title", "made", "step", "due", "note"))}
    mine = {(r["kind"], r["ref"]): dict(r) for r in con.execute("select * from recall")}
    their_logs = {}
    for r in _rows(data, "recall_log", ("card", "ts", "grade", "gap", "text")):
        card = theirs.get(_int(r["card"]))
        if card:
            their_logs.setdefault((_str(card["kind"]), _str(card["ref"])), []).append(r)
    touched = set()
    for cid, c in theirs.items():
        key = (_str(c["kind"]), _str(c["ref"]))
        if not key[0] or not key[1]:
            continue
        if key not in mine:
            due = c["due"]
            cur = con.execute("insert into recall(kind, ref, title, made, step, due, note) values(?,?,?,?,?,?,?)",
                              (key[0], key[1], _str(c["title"]), _int(c["made"]), _int(c["step"]), None if due is None else _int(due), _str(c["note"])))
            mine[key] = {"id": cur.lastrowid, "kind": key[0], "ref": key[1], "made": _int(c["made"])}
            count("recall notes")
        else:
            m = mine[key]
            if _int(c["made"]) < m["made"]:
                con.execute("update recall set made=? where id=?", (_int(c["made"]), m["id"]))
                m["made"] = _int(c["made"])
                touched.add(key)
            if not m.get("note") and c["note"]:
                con.execute("update recall set note=? where id=?", (_str(c["note"]), m["id"]))
        card_id = mine[key]["id"]
        have = {(r[0], r[1]) for r in con.execute("select ts, grade from recall_log where card=?", (card_id,))}
        for r in their_logs.get(key, []):
            row = (_int(r["ts"]), _int(r["grade"]))
            if row not in have:
                have.add(row)
                con.execute("insert into recall_log(card, ts, grade, gap, text) values(?,?,?,?,?)", (card_id, row[0], row[1], _int(r["gap"]), _str(r["text"])))
                count("recall attempts")
                if key in mine and cid is not None:
                    touched.add(key)
    if any(k[0] == "quiz" for k in mine) and added.get("quiz answers"):
        touched.update(k for k in mine if k[0] == "quiz")
    for key in touched:
        replay(con, mine[key]["id"], quiz_resets)

    # ---- solution files: the most recently saved wins
    for rel, f in (data.get("work") or {}).items():
        if not isinstance(f, dict) or not isinstance(f.get("code"), str):
            continue
        parts = rel.replace("\\", "/").split("/")
        if len(parts) != 2 or any(p in ("", ".", "..") for p in parts) or not parts[1].endswith(".py"):
            continue
        path = os.path.join(work_dir, parts[0], parts[1])
        mtime = _int(f.get("mtime"))
        if os.path.isfile(path) and os.path.getmtime(path) >= mtime:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as out:
            out.write(f["code"])
        try:
            os.utime(path, (mtime, mtime))
        except OSError:
            pass
        count("solution files")
    return added


def replay(con, card_id, quiz_resets=None):
    """Work a recall card's schedule out again from everything that happened to it, as the app does when each happens."""
    c = con.execute("select * from recall where id=?", (card_id,)).fetchone()
    if not c:
        return
    events = [(r["ts"], 1, r["grade"]) for r in con.execute("select ts, grade from recall_log where card=?", (card_id,))]
    if c["kind"] == "quiz" and (quiz_resets is None or quiz_resets(c["ref"])):
        events += [(r["ts"], 0, None) for r in con.execute("select ts from quiz where qid=? and correct=0 and ts>?", (c["ref"], c["made"]))]
    step, due = 0, engine.ordinal(c["made"]) + engine.RECALL_DAYS[0]
    for ts, kind, grade in sorted(events):
        today = engine.ordinal(ts)
        if kind == 0:                                    # a wrong answer in the quiz starts the card over
            step, due = 0, today + engine.RECALL_DAYS[0]
            continue
        if due is not None and due > today and grade == 2:
            continue                                     # recalled before it was due: the date stays
        step, due = engine.recall_next(step, grade, today)
    con.execute("update recall set step=?, due=? where id=?", (step, due, card_id))


ORDER = (("exercises solved", "exercise solved"), ("runs", "run"), ("rewrites", "rewrite"), ("lessons read", "lesson read"),
         ("list rows ticked", "list row ticked"), ("quiz answers", "quiz answer"), ("recall notes", "recall note"),
         ("recall attempts", "recall attempt"), ("focus sessions", "focus session"), ("notes", "note"), ("papers", "paper"),
         ("paper notes", "paper note"), ("solution files", "solution file"), ("nudges", "nudge"))


def describe(added):
    """A sentence for the page."""
    parts = ["%d %s" % (added[k], k if added[k] != 1 else one) for k, one in ORDER if added.get(k)]
    if not parts:
        return "Nothing new: this device already had everything in that file."
    return "Added " + ", ".join(parts) + "."
