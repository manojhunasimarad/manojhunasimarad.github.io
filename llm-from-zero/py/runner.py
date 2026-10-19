"""Runs a solution against tests in a separate Python process and compares the output.

A test is a piece of code that prints something, plus the text it should print.
Values are compared as values: a NumPy array and the same numbers written as a list match,
numbers match within a small tolerance, and dictionaries match in any key order.
"""

import ast
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

NUMBER = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?|[-+]?\b(?:inf|nan)\b"
QUOTED = r"'[^'\n]*'|\"[^\"\n]*\""
TOKEN = re.compile("(" + QUOTED + ")|(" + NUMBER + r")|([A-Za-z_][A-Za-z_0-9]*)|([\[\]])")
# Words that only describe how NumPy prints a value, not the value itself.
NOISE = {"array", "np", "numpy", "dtype", "float", "float16", "float32", "float64", "int", "int8", "int16",
         "int32", "int64", "uint8", "bool", "bool_", "str_", "object"}
PRELUDE = "try:\n    import numpy as np\nexcept ImportError:\n    pass\n\n"


def tokens(text, brackets=True):
    out = []
    for quoted, number, word, bracket in TOKEN.findall(text):
        if quoted:
            out.append(quoted[1:-1])     # a quoted string counts as one token, so 'it s' and "it's" differ
        elif number:
            out.append(float(number))
        elif word:
            word = {"True_": "True", "False_": "False"}.get(word, word)
            if word not in NOISE:
                out.append(word)
        elif brackets:
            out.append(bracket)
    return out


def same_tokens(a, b):
    if len(a) != len(b):
        return False
    for x, y in zip(a, b):
        if isinstance(x, float) and isinstance(y, float):
            if math.isnan(x) and math.isnan(y):
                continue
            if not math.isclose(x, y, rel_tol=1e-3, abs_tol=1e-4):
                return False
        elif x != y:
            return False
    return True


def literal(text):
    try:
        return ast.literal_eval(text.strip())
    except Exception:
        return NotImplemented


def deep_equal(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return same_tokens([float(a)], [float(b)])
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(deep_equal(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(deep_equal(x, y) for x, y in zip(a, b))
    return a == b


def compare(got, expected):
    """Return "same", "shape" (values match, bracket nesting differs) or "different"."""
    if got.strip() == expected.strip():
        return "same"
    a, b = literal(got), literal(expected)
    if a is not NotImplemented and b is not NotImplemented and deep_equal(a, b):
        return "same"
    if same_tokens(tokens(got), tokens(expected)):
        return "same"
    if same_tokens(tokens(got, False), tokens(expected, False)):
        return "shape"
    return "different"


def run_one(code, test, seconds, given=""):
    """Run the solution followed by one test. Return (stdout, stderr, timed_out).

    `given` is code an exercise defines for the learner, such as the launcher of the GPU exercises. It runs first.
    """
    folder = tempfile.mkdtemp(prefix="lfz_")
    try:
        path = os.path.join(folder, "run_test.py")
        with open(path, "w", encoding="utf-8") as f:
            f.write(PRELUDE + given + code + "\n\n" + test + "\n")
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONDONTWRITEBYTECODE="1")
        try:
            r = subprocess.run([sys.executable, path], cwd=folder, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=seconds, env=env)
            return r.stdout, r.stderr, False
        except subprocess.TimeoutExpired:
            return "", "Stopped after %d seconds. Is there an endless loop?" % seconds, True
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def clip(text, limit=1200):
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + " ..."


def tidy_error(stderr, skip=0):
    """Keep the useful end of a traceback and hide the temporary file path. `skip` lines of given code come before the learner's."""
    lines = [ln for ln in stderr.strip().splitlines() if ln.strip()]
    if not lines:
        return ""
    keep = lines[-6:]
    text = "\n".join(keep)
    text = re.sub(r'File "[^"]*run_test\.py", line (\d+)', lambda m: "line %d" % max(1, int(m.group(1)) - PRELUDE.count("\n") - skip), text)
    return clip(text, 900)


def with_given(given):
    """The given code as it is placed before the learner's: followed by blank lines, so line numbers stay readable."""
    return given.rstrip("\n") + "\n\n\n" if given else ""


def source(code, test, given=""):
    """The whole program one test runs: the prelude, the given code, the learner's code, then the test."""
    return PRELUDE + with_given(given) + code + "\n\n" + test + "\n"


def not_run(n, t):
    return {"n": n, "ok": False, "shape": False, "ran": clip(str(t.get("test", "")), 700), "expected": clip(str(t.get("expected_output", ""))),
            "got": "", "error": "Not run, because an earlier test did not finish.", "timeout": True}


def result_for(n, t, out, err, timed_out, given=""):
    """Turn what one test printed into the dictionary the page shows."""
    test_code = str(t.get("test", ""))
    want = str(t.get("expected_output", ""))
    verdict = compare(out, want)
    return {
        "n": n,
        "ok": verdict == "same",
        "shape": verdict == "shape",
        "ran": clip(test_code, 700),
        "expected": clip(want),
        "got": clip(out),
        "error": tidy_error(err, with_given(given).count("\n")) if (err.strip() and verdict != "same") else "",
        "timeout": timed_out,
    }


def run_tests(code, tests, seconds=10, given=""):
    """Run every test. Return a list of result dictionaries, one per test."""
    results = []
    stalled = False
    for n, t in enumerate(tests, 1):
        if stalled:   # do not wait for the same endless loop again
            results.append(not_run(n, t))
            continue
        out, err, timed_out = run_one(code, str(t.get("test", "")), seconds, with_given(given))
        stalled = timed_out
        results.append(result_for(n, t, out, err, timed_out, given))
    return results
