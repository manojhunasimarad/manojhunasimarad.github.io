"""The app's server code, answering the page from inside the browser.

api-worker.js loads Pyodide, puts the app's Python files and content into Pyodide's file system,
mounts the data folders on IndexedDB, and then calls the functions here. server.py itself is the
same file the laptop version runs; what differs in a browser is replaced below:

    running tests       done by a second worker (run-worker.js), which can be stopped when a
                        test does not finish; its results are handed to the server code here
    the agent           needs a model server and a network connection: refused, with a reason
    papers by link      browsers may not fetch other sites' files: refused, upload works
    ML problems         downloaded by the page from GitHub and written into the file system
"""

import json
import os
import sys
import traceback
import types
import urllib.parse

os.environ["LFZ_WEB"] = "1"
for name in ("webbrowser",):          # not every module of the standard library is in the browser build
    try:
        __import__(name)
    except ImportError:
        sys.modules[name] = types.ModuleType(name)

import runner  # noqa: E402
import server  # noqa: E402

LAPTOP = "This works in the laptop version, which runs on your own computer."
_results = []


def _run_tests(code, tests, seconds=10, given=""):
    """The server asks for test results; the page has already run the tests in the other worker."""
    if not _results:
        raise RuntimeError("The tests were not run. Reload the page.")
    return _results.pop()


def _refuse(message):
    def refuse(self, *_a):
        raise server.Bad(message)
    return refuse


def start():
    runner.run_tests = _run_tests
    server.has_numpy = lambda: "loads in the browser when a problem needs it"
    server.Api.agent_config = _refuse("The agent runs in the laptop version, with a model on your own GPU.")
    server.Api.agent_test = server.Api.agent_config
    server.Api.papers_add = _refuse("In the browser version, download the paper's PDF and upload it here. Fetching by link works in the laptop version.")
    server.Api.gpu = lambda self, _q: {"torch": "", "error": LAPTOP}
    server.Api.agent_check = lambda self, _q: {"gpus": [], "ollama": False, "system": "browser", "apple": False, "fits": "", "note": LAPTOP}
    server.init_db()
    server.C = server.Content()
    server.migrate()
    return json.dumps({"version": server.C.manifest["version"], "python": sys.version.split()[0], "ml": server.C.ml_installed()})


def _answer(status, body):
    return json.dumps({"status": status, "body": body}, ensure_ascii=False)


def call(method, path, query, body):
    """One request from the page. Returns {"status", "body"} as JSON text."""
    if path in server.STREAM:
        return _answer(400, {"error": "The agent runs in the laptop version, with a model on your own GPU."})
    table = server.GET if method == "GET" else server.POST
    name = table.get(path)
    if not name:
        return _answer(404, {"error": "Not found."})
    try:
        if method == "GET":
            payload = {k: v[0] for k, v in urllib.parse.parse_qs(query.lstrip("?")).items()}
        else:
            payload = json.loads(body or "{}")
            if not isinstance(payload, dict):
                return _answer(400, {"error": "Bad request."})
        if name == "run":
            _results.clear()
            _results.append(payload.pop("__results", None) or [])
        return _answer(200, getattr(server.API, name)(payload))
    except (server.NotFound, server.Bad, server.Forbidden) as e:
        return _answer(e.status, {"error": str(e)})
    except Exception as e:
        traceback.print_exc()
        return _answer(500, {"error": "%s: %s" % (type(e).__name__, e)})
    finally:
        _results.clear()


def prepare(ex_id):
    """What the test worker needs to run an exercise's tests."""
    ex = server.C.exercises.get(ex_id)
    if not ex:
        return _answer(404, {"error": "No such exercise."})
    full = server.C.full(ex)
    return _answer(200, {"tests": full["tests"], "given": full.get("given", ""), "timeout": full.get("timeout", 6), "set": ex["set"]})


def upload(name, path):
    """A PDF the page wrote to `path`."""
    try:
        with open(path, "rb") as f:
            data = f.read()
        os.remove(path)
        if len(data) > server.papers.MAX_BYTES:
            return _answer(413, {"error": "That file is larger than 80 MB."})
        return _answer(200, server.API.papers_store(data, name))
    except (server.NotFound, server.Bad, server.Forbidden) as e:
        return _answer(e.status, {"error": str(e)})


def paper_path(pid):
    path = os.path.join(server.PAPERS, os.path.basename(pid))
    return path if os.path.isfile(path) else ""


def ml_dir():
    return server.ML_Q


def ml_loaded():
    server.C.load_ml()
    server.C.reindex()
    n = len(server.C.ml)
    return _answer(200, {"ok": True, "count": n, "message": "Downloaded %d problems." % n})
