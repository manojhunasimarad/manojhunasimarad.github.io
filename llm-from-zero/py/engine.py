"""Mastery, the next-problem suggestion and the rewrite-from-memory schedule.

Everything here is computed from what the database already records: runs, hints opened, solutions
viewed and rewrites passed. Nothing is stored that could drift out of step with those facts.

How a solved exercise is scored (0 to 1):
    1.00  solved with no hint and no look at the solution, in a few runs
   -0.15  for each hint opened before it passed
   -0.10  if more than three runs failed first
    0.40  at most, if the solution was opened before it passed
    then  each rewrite from memory that passes lifts it: to at least 0.8, 0.9, 1.0

A skill's mastery is the average of its exercises' scores, weighted by step (1 to 3), so the harder
ones count for more. An unsolved exercise below a cleanly solved harder one in the same skill gets
half credit: if you can do the hard version unaided, the easy one is not in doubt.
"""

import datetime
import time

LEVEL = {"easy": 1, "medium": 2, "hard": 3}
REVIEW_DAYS = (1, 7, 30)     # days after solving, then after each passed rewrite
STRONG = 0.75                # a skill at or above this is drawn as strong
MET = 0.5                    # a prerequisite at or above this counts as met
STRUGGLE = 4                 # failed runs on an unsolved exercise before the app suggests a step back
REVIEWS_A_DAY = 2
RECALL_DAYS = (1, 7, 30)     # the wait after writing a note, then after each recall that had all of it
RECALL_A_DAY = 6


def ordinal(ts):
    return datetime.date.fromtimestamp(ts).toordinal()


def quality(hints, sol_seen, fails):
    q = 1.0 - 0.15 * min(hints, 3) - (0.1 if fails > 3 else 0.0)
    if sol_seen:
        q = min(q, 0.4)
    return max(q, 0.25)


class Graph:
    """The skill graph joined with the exercises that are actually available on this computer."""

    def __init__(self, doc, exercises, ml_plan):
        self.doc = doc
        self.skills = []
        self.by_id = {}
        self.skill_of = {}
        self.level = {}
        self.then = dict(doc.get("then", {}))
        for s in doc["skills"]:
            ladder = [list(x) for x in s.get("ladder", [])]
            wanted = len(ladder)
            if s.get("ml_block") is not None and s["ml_block"] < len(ml_plan):
                ids = ["ml-%d" % n for n in ml_plan[s["ml_block"]]["ids"]]
                wanted = len(ids)
                ladder = [[i, LEVEL.get(exercises[i].get("difficulty"), 2)] for i in ids if i in exercises]
            else:
                ladder = [x for x in ladder if x[0] in exercises]
            sk = dict(s, ladder=ladder, wanted=wanted,
                      kind="quiz" if s.get("quiz") else ("ml" if s.get("ml_block") is not None else "ex"),
                      linear=s["group"] in ("py", "ml", "sys", "num"))   # these follow a course order; only the DSA ladders are "same idea, harder"
            self.skills.append(sk)
            self.by_id[sk["id"]] = sk
            for ex_id, lv in ladder:
                self.skill_of[ex_id] = sk["id"]
                self.level[ex_id] = lv
        self.unlocks = {s["id"]: [t["id"] for t in self.skills if s["id"] in t["needs"]] for s in self.skills}


def states(con, exercises):
    """Per exercise: what happened to it."""
    st = {}

    def get(ex):
        return st.setdefault(ex, {"runs": 0, "fails": 0, "last": (0, 0), "solved": 0, "hints": 0, "sol_seen": False,
                                  "passes": 0, "last_pass": 0, "last_fail": 0, "snap": None})

    # "last" orders exercises by when they were last worked on. Times are whole seconds, so the row
    # number breaks ties between two runs in the same second.
    for r in con.execute("select rowid, ex, ts, passed, total, changed from attempts order by rowid"):
        if r["ex"] not in exercises:
            continue
        s = get(r["ex"])
        if r["changed"]:
            s["runs"] += 1
            if r["passed"] < r["total"] or not r["total"]:
                s["fails"] += 1
        s["last"] = max(s["last"], (r["ts"], r["rowid"]))
    for r in con.execute("select ex, ts from solved"):
        if r["ex"] in exercises:
            s = get(r["ex"])
            s["solved"] = r["ts"]
            s["last"] = max(s["last"], (r["ts"], 0))
    for r in con.execute("select ex, level from hints"):
        if r["ex"] in exercises:
            get(r["ex"])["hints"] = r["level"]
    for r in con.execute("select ex from sol_views"):
        if r["ex"] in exercises:
            get(r["ex"])["sol_seen"] = True
    for r in con.execute("select ex, hints, sol_seen, fails from solves"):
        if r["ex"] in exercises:
            get(r["ex"])["snap"] = (r["hints"], bool(r["sol_seen"]), r["fails"])
    for r in con.execute("select ex, ts, ok from reviews order by ts"):
        if r["ex"] in exercises:
            s = get(r["ex"])
            if r["ok"]:
                s["passes"] += 1
                s["last_pass"] = r["ts"]
            else:
                s["last_fail"] = r["ts"]
    for ex, s in st.items():
        is_ml = exercises[ex].get("set") == "ml"   # there the single "hint" is the theory, which you are meant to read
        if s["solved"]:
            hints, seen, fails = s["snap"] if s["snap"] else (s["hints"], s["sol_seen"], s["fails"])
            if is_ml:
                hints = 0
            s["help"] = {"hints": hints, "sol_seen": seen, "fails": fails}
            q = quality(hints, seen, fails)
            s["clean"] = hints == 0 and not seen and fails <= 3
            s["score"] = q if not s["passes"] else min(1.0, max(q, 0.7) + 0.1 * s["passes"])
        else:
            s["help"] = {"hints": 0 if is_ml else s["hints"], "sol_seen": s["sol_seen"], "fails": s["fails"]}
            s["clean"] = False
            s["score"] = 0.0
        s["due"] = due_day(s)
    return st


def due_day(s):
    """The day number on which the next rewrite from memory is due, or None."""
    if not s["solved"] or s["passes"] >= len(REVIEW_DAYS):
        return None
    base = s["last_pass"] if s["passes"] else s["solved"]
    day = ordinal(base) + REVIEW_DAYS[s["passes"]]
    if s["last_fail"] > base:
        day = max(day, ordinal(s["last_fail"]) + 1)
    return day


def day_text(day, today=None):
    today = today or ordinal(time.time())
    if day is None:
        return ""
    if day <= today:
        return "due now"
    if day == today + 1:
        return "due tomorrow"
    return "due " + datetime.date.fromordinal(day).strftime("%d %b").lstrip("0")


def help_text(h):
    parts = []
    if h["sol_seen"]:
        parts.append("the solution open")
    if h["hints"]:
        parts.append("%d hint%s" % (h["hints"], "" if h["hints"] == 1 else "s"))
    if h["fails"] > 3:
        parts.append("%d runs" % h["fails"])
    return " and ".join(parts)


def scores(G, st):
    """Exercise scores including the half credit for easier exercises below a clean harder solve."""
    out = {}
    for sk in G.skills:
        top = max([lv for ex, lv in sk["ladder"] if st.get(ex, {}).get("clean")] or [0])
        for ex, lv in sk["ladder"]:
            s = st.get(ex)
            if s and s["solved"]:
                out[ex] = s["score"]
            elif lv < top:
                out[ex] = 0.5
            else:
                out[ex] = 0.0
    return out


def mastery(G, st, quiz_stats, questions_by_topic):
    """Per skill: mastery, counts and a state for the map."""
    sc = scores(G, st)
    out = {}
    for sk in G.skills:
        if sk["kind"] == "quiz":
            ids = questions_by_topic.get(sk["quiz"], [])
            right = sum(1 for i in ids if quiz_stats.get(i, {}).get("last"))
            seen = sum(1 for i in ids if i in quiz_stats)
            out[sk["id"]] = {"m": right / len(ids) if ids else 0.0, "done": right, "total": len(ids), "touched": seen > 0}
        else:
            weight = sum(lv for _ex, lv in sk["ladder"])
            got = sum(lv * sc[ex] for ex, lv in sk["ladder"])
            solved = sum(1 for ex, _lv in sk["ladder"] if st.get(ex, {}).get("solved"))
            touched = any(st.get(ex, {}).get("runs") or st.get(ex, {}).get("solved") for ex, _lv in sk["ladder"])
            out[sk["id"]] = {"m": got / weight if weight else 0.0, "done": solved, "total": len(sk["ladder"]) or sk["wanted"],
                             "touched": touched, "missing": not sk["ladder"]}
    for sk in G.skills:
        o = out[sk["id"]]
        met = all(out[n]["m"] >= MET for n in sk["needs"])
        o["met"] = met
        o["state"] = ("missing" if o.get("missing") else "strong" if o["m"] >= STRONG else "learning" if o["touched"]
                      else "ready" if met else "later")
    return out


def _pick(G, ex, kind, why):
    return {"id": ex, "kind": kind, "why": why, "skill": G.skill_of.get(ex)}


def recommend(G, st, mast, titles, scope=None, sets=None):
    """The next exercise to do, with the reason. `scope` limits it to one set (python, dsa or ml)."""
    def ok(ex):
        return ex in titles and (scope is None or sets.get(ex) == scope)

    def solved(ex):
        return bool(st.get(ex, {}).get("solved"))

    def open_in(sk):
        return [(ex, lv) for ex, lv in sk["ladder"] if ok(ex) and not solved(ex)]

    def name(ex):
        return "“%s”" % titles[ex]

    def first_on_path(skip=None):
        early = None
        for sk in G.skills:
            if sk["kind"] == "quiz" or sk["id"] == skip:
                continue
            todo = open_in(sk)
            if not todo or mast[sk["id"]]["m"] >= STRONG:
                continue
            if mast[sk["id"]]["met"]:
                return sk, todo[0][0], None
            if early is None:
                lacking = next(n for n in sk["needs"] if mast[n]["m"] < MET)
                early = (sk, todo[0][0], lacking)
        if early:
            return early
        for sk in G.skills:                      # everything left is in skills already strong
            todo = open_in(sk) if sk["kind"] != "quiz" and sk["id"] != skip else []
            if todo:
                return sk, todo[0][0], None
        return None

    last = None
    for ex, s in st.items():
        if ok(ex) and ex in G.skill_of and s["last"][0] and (last is None or s["last"] > st[last]["last"]):
            last = ex

    if last:
        s = st[last]
        sk = G.by_id[G.skill_of[last]]
        lv = G.level[last]
        todo = open_in(sk)
        after = [x for x in sk["ladder"] if ok(x[0])]
        pos = [x[0] for x in after].index(last)
        later = [(ex, l) for ex, l in after[pos + 1:] if not solved(ex)]
        if not s["solved"]:
            if s["fails"] >= STRUGGLE and sk["linear"]:
                return _pick(G, last, "continue", ("%d runs have not passed. Read the theory notes under the statement, then try again." if sk["kind"] == "ml"
                                                   else "%d runs have not passed. Open the next hint. That is what hints are for.") % s["fails"])
            if s["fails"] >= STRUGGLE:
                easier = [ex for ex, l in todo if l < lv]
                if easier:
                    return _pick(G, easier[-1], "easier", "%d runs on %s have not passed. This one uses the same idea with less in the way. Go back to %s after it."
                                 % (s["fails"], name(last), name(last)))
                weak = sorted((n for n in sk["needs"] if open_in(G.by_id[n])), key=lambda n: mast[n]["m"])
                if weak and mast[weak[0]]["m"] < STRONG:
                    back = G.by_id[weak[0]]
                    return _pick(G, open_in(back)[0][0], "easier", "%d runs on %s have not passed. It builds on “%s”, which is not solid yet. Do this first."
                                 % (s["fails"], name(last), back["name"]))
                return _pick(G, last, "continue", "%d runs have not passed. Open the next hint. That is what hints are for." % s["fails"])
            return _pick(G, last, "continue", "You have started this one and it does not pass yet.")
        if sk["linear"]:
            if later:
                why = "Next in the lesson order." if s["clean"] else "Next in the lesson order. You solved %s with %s, so it comes back as a rewrite." % (name(last), help_text(s["help"]))
                return _pick(G, later[0][0], "path", why)
        elif s["clean"]:
            t = G.then.get(last)
            if t and ok(t) and not solved(t):
                return _pick(G, t, "harder", "You solved %s without help. This is the same idea, one step harder." % name(last))
            harder = [ex for ex, l in later if l > lv] or [ex for ex, l in todo if l > lv]
            if harder:
                return _pick(G, harder[0], "harder", "You solved %s without help. This is the next step up in “%s”." % (name(last), sk["name"]))
            if mast[sk["id"]]["m"] < MET and todo:
                return _pick(G, todo[-1][0], "same", "One more in “%s” before moving on." % sk["name"])
        else:
            same = [ex for ex, l in later if l == lv] or [ex for ex, l in todo if l == lv]
            if same:
                return _pick(G, same[0], "same", "You solved %s with %s. One more at the same level before the harder one." % (name(last), help_text(s["help"])))
            lower = [ex for ex, l in todo if l < lv]
            if lower:
                return _pick(G, lower[-1], "same", "You solved %s with %s. This one is a step easier and uses the same idea." % (name(last), help_text(s["help"])))
            if todo:
                return _pick(G, todo[0][0], "harder", "The next step in “%s”. Take your time with it." % sk["name"])
        # this skill has nothing more to give right now: move to what it unlocks, or along the path
        for nid in G.unlocks.get(sk["id"], []):
            nxt = G.by_id[nid]
            if nxt["kind"] != "quiz" and mast[nid]["met"] and open_in(nxt) and mast[nid]["m"] < STRONG:
                return _pick(G, open_in(nxt)[0][0], "new", "“%s” is in good shape. This starts “%s”, which builds on it." % (sk["name"], nxt["name"]))
        found = first_on_path(skip=sk["id"] if not todo else None)
        if found:
            nxt, ex, lacking = found
            if nxt["id"] == sk["id"]:
                return _pick(G, ex, "same", "Still open in “%s”." % sk["name"])
            return _pick(G, ex, "new", "Next on the path: “%s”." % nxt["name"])
        return None

    found = first_on_path()
    if not found:
        return None
    sk, ex, lacking = found
    if lacking:
        return _pick(G, ex, "early", "First in order. It will be easier once “%s” is in place." % G.by_id[lacking]["name"])
    started = any(s["solved"] for e, s in st.items() if ok(e))
    return _pick(G, ex, "path", ("Next on the path: “%s”." % sk["name"]) if started else "Start here.")


def reviews_due(G, st, titles, today=None):
    """Exercises whose rewrite from memory is due, the ones solved with help first."""
    today = today or ordinal(time.time())
    due = [(ex, s) for ex, s in st.items() if ex in titles and s["due"] is not None and s["due"] <= today]
    due.sort(key=lambda x: (x[1]["clean"], x[1]["due"], -G.level.get(x[0], 1)))
    return [{"id": ex, "passes": s["passes"], "clean": s["clean"], "late": today - s["due"]} for ex, s in due]


def recall_next(step, grade, today):
    """Where a recall card goes after an attempt. grade: 0 lost it, 1 parts of it, 2 all of it.

    A card at step s is waiting out RECALL_DAYS[s]. All of it: on to the next, longer wait. Parts of it: half the
    same wait again. Lost it: back to tomorrow. Returns (step, due day); the day is None once a month was survived.
    """
    if grade <= 0:
        return 0, today + RECALL_DAYS[0]
    step = max(0, min(step, len(RECALL_DAYS) - 1))
    if grade == 1:
        return step, today + max(1, RECALL_DAYS[step] // 2)
    step += 1
    if step >= len(RECALL_DAYS):
        return step, None
    return step, today + RECALL_DAYS[step]


def streaks(days):
    """Current and longest run of consecutive active days. `days` holds day numbers."""
    if not days:
        return 0, 0
    today = ordinal(time.time())
    cur, d = 0, today if today in days else today - 1
    while d in days:
        cur += 1
        d -= 1
    best = run = 0
    prev = None
    for d in sorted(days):
        run = run + 1 if prev is not None and d == prev + 1 else 1
        best = max(best, run)
        prev = d
    return cur, best
