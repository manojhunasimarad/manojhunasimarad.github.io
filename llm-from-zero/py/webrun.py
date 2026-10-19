"""Running one test of the learner's code, inside the test worker (run-worker.js).

The laptop version starts a fresh Python for each test. Here the worker's Python is reused, and a
test that does not finish is handled by the page, which stops the whole worker and starts a new one.
Results are built by the same function the laptop version uses, so they look the same.
"""

import io
import json
import linecache
import sys
import traceback

import runner


def run_test(n, test_json, code, given):
    t = json.loads(test_json)
    src = runner.source(code, str(t.get("test", "")), given)
    linecache.cache["run_test.py"] = (len(src), None, src.splitlines(True), "run_test.py")
    out, err = io.StringIO(), io.StringIO()
    keep = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    try:
        exec(compile(src, "run_test.py", "exec"), {"__name__": "__main__"})
    except SystemExit:
        pass
    except BaseException as e:
        traceback.print_exception(type(e), e, e.__traceback__.tb_next)      # from the learner's code on, as on the laptop
    finally:
        sys.stdout, sys.stderr = keep
    return json.dumps(runner.result_for(n, t, out.getvalue(), err.getvalue(), False, given))
