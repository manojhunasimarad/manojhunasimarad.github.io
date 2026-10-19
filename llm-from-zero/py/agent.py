"""The local agent: a language model that runs on your own computer, or on one you tunnel to.

The app never talks to a model unless you set one up under Settings. When you do, the text of the
paper or exercise you ask about is sent to that address and nowhere else.

Two kinds of model server are understood:
  Ollama                  (its own API, which lets the app set the context length)
  OpenAI-compatible       (llama.cpp server, vLLM, LM Studio and others: /v1/chat/completions)

Standard library only.
"""

import json
import math
import re
import urllib.error
import urllib.request

DEFAULT_URL = "http://127.0.0.1:11434"
DEFAULT_CTX = 8192
CHARS_PER_TOKEN = 3.2     # a cautious figure for English text with formulas
RESERVE = 1600            # tokens kept back for the instructions and the answer


class AgentError(Exception):
    pass


def clean_base(url):
    url = (url or DEFAULT_URL).strip().rstrip("/")
    if not re.match(r"https?://", url):
        url = "http://" + url
    return re.sub(r"/v1$", "", url)


def _json(url, data=None, timeout=8):
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8") if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace") or "{}")


def detect(base):
    """Find out what answers at this address and which models it offers."""
    base = clean_base(base)
    try:
        doc = _json(base + "/api/tags")
        if isinstance(doc.get("models"), list):
            models = []
            for m in doc["models"]:
                d = m.get("details") or {}
                models.append({"name": m.get("name", ""), "params": d.get("parameter_size", ""), "quant": d.get("quantization_level", ""),
                               "gb": round((m.get("size") or 0) / 2 ** 30, 1)})
            return {"kind": "ollama", "models": models, "error": ""}
    except (urllib.error.URLError, OSError, ValueError):
        pass
    try:
        doc = _json(base + "/v1/models")
        if isinstance(doc.get("data"), list):
            return {"kind": "openai", "models": [{"name": m.get("id", ""), "params": "", "quant": "", "gb": 0} for m in doc["data"]], "error": ""}
    except urllib.error.HTTPError as e:
        return {"kind": None, "models": [], "error": "The server at %s answered with an error (%s)." % (base, e.code)}
    except (urllib.error.URLError, OSError, ValueError):
        pass
    return {"kind": None, "models": [], "error": "Nothing answered at %s. Is the model server running?" % base}


def _strip_think(parts):
    """Drop <think>...</think> blocks from a stream of text pieces, even when a tag is split across pieces."""
    buf, inside = "", False
    for kind, piece in parts:
        if kind != "delta":
            yield kind, piece
            continue
        buf += piece
        while True:
            if inside:
                end = buf.find("</think>")
                if end == -1:
                    buf = buf[-8:]
                    break
                buf, inside = buf[end + 8:], False
            else:
                start = buf.find("<think>")
                if start == -1:
                    tail = buf.rfind("<", max(0, len(buf) - 7))    # a "<" near the end could be the start of a tag
                    keep = len(buf) if tail == -1 else tail
                    if keep:
                        yield "delta", buf[:keep]
                    buf = buf[keep:]
                    break
                if start:
                    yield "delta", buf[:start]
                yield "think", ""
                buf, inside = buf[start + 7:], True
    if buf and not inside:
        yield "delta", buf


def _raw_chat(cfg, messages, temperature):
    base, kind = clean_base(cfg.get("url")), cfg.get("kind")
    model = cfg.get("model") or ""
    if not model:
        raise AgentError("No model is chosen yet. Choose one under Settings.")
    if kind == "ollama":
        url = base + "/api/chat"
        body = {"model": model, "messages": messages, "stream": True,
                "options": {"num_ctx": int(cfg.get("ctx") or DEFAULT_CTX), "temperature": temperature}}
    else:
        url = base + "/v1/chat/completions"
        body = {"model": model, "messages": messages, "stream": True, "temperature": temperature}
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=600)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        try:
            err = json.loads(detail).get("error")
            detail = err.get("message") if isinstance(err, dict) else str(err)
        except ValueError:
            pass
        raise AgentError("The model server refused the request: %s" % (detail or e.code))
    except (urllib.error.URLError, OSError) as e:
        raise AgentError("Could not reach the model at %s (%s). Is it running?" % (base, getattr(e, "reason", e)))
    try:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            if kind == "ollama":
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if obj.get("error"):
                    raise AgentError(str(obj["error"]))
                msg = obj.get("message") or {}
                if msg.get("thinking"):
                    yield "think", ""
                if msg.get("content"):
                    yield "delta", msg["content"]
            else:
                if not line.startswith("data:"):
                    continue
                line = line[5:].strip()
                if line == "[DONE]":
                    break
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if obj.get("error"):
                    err = obj["error"]
                    raise AgentError(err.get("message") if isinstance(err, dict) else str(err))
                choice = (obj.get("choices") or [{}])[0]
                delta = choice.get("delta") or {}
                if delta.get("reasoning_content") or delta.get("reasoning"):
                    yield "think", ""
                if delta.get("content"):
                    yield "delta", delta["content"]
    finally:
        resp.close()


def chat(cfg, messages, temperature=0.2):
    """Yield ("delta", text) pieces of the answer, and ("think", "") while the model reasons privately."""
    return _strip_think(_raw_chat(cfg, messages, temperature))


def complete(cfg, messages, temperature=0.2):
    return "".join(piece for kind, piece in chat(cfg, messages, temperature) if kind == "delta").strip()


# ------------------------------------------------------------------ finding the right part of a paper

def chunks(pages, size=1100, overlap=160):
    """Cut each page into overlapping pieces, remembering the page number."""
    out = []
    for n, text in enumerate(pages, 1):
        text = re.sub(r"[ \t]+", " ", text or "").strip()
        start = 0
        while start < len(text):
            piece = text[start:start + size]
            if len(piece.strip()) > 40:
                out.append({"page": n, "text": piece.strip()})
            if start + size >= len(text):
                break
            start += size - overlap
    return out


def words(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def best_chunks(all_chunks, query, k=6):
    """BM25: rank pieces by the words they share with the question, rare words counting for more."""
    q = set(words(query))
    if not q or not all_chunks:
        return all_chunks[:k]
    docs = [words(c["text"]) for c in all_chunks]
    n = len(docs)
    avg = sum(len(d) for d in docs) / n
    df = {}
    for d in docs:
        for w in set(d) & q:
            df[w] = df.get(w, 0) + 1
    scored = []
    for i, d in enumerate(docs):
        score = 0.0
        for w in q:
            f = d.count(w)
            if f:
                idf = math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5))
                score += idf * f * 2.5 / (f + 1.5 * (0.25 + 0.75 * len(d) / avg))
        scored.append((score, i))
    top = sorted(scored, reverse=True)[:k]
    if top[0][0] == 0:
        return all_chunks[:k]
    return [all_chunks[i] for _s, i in sorted(top, key=lambda x: x[1]) if _s > 0]


def budget(cfg):
    return max(3000, int((int(cfg.get("ctx") or DEFAULT_CTX) - RESERVE) * CHARS_PER_TOKEN))


def parts_of(pages, limit):
    """Group whole pages into parts of at most `limit` characters, each page marked with its number."""
    parts, cur = [], ""
    for n, text in enumerate(pages, 1):
        text = (text or "").strip()
        if not text:
            continue
        block = "[p. %d]\n%s\n\n" % (n, text)
        while len(block) > limit:                       # one very long page
            if cur:
                parts.append(cur)
                cur = ""
            parts.append(block[:limit])
            block = "[p. %d, continued]\n%s" % (n, block[limit:])
        if len(cur) + len(block) > limit and cur:
            parts.append(cur)
            cur = ""
        cur += block
    if cur:
        parts.append(cur)
    return parts


# ------------------------------------------------------------------ what the agent is asked to do

READER = ("You help a student read a research paper. Use only the text you are given. If the text does not say something, "
          "say that it does not. Write plainly, for a reader who is new to the field. Refer to pages like this: (p. 4).")

SUMMARY_FORM = """Write a summary with exactly these headings:

**Problem** - two sentences on what the paper tries to solve and why it matters.
**What they did** - the method, in four to six sentences.
**Claims and evidence** - each main claim as a bullet, with the evidence the paper gives for it and the page.
**What is not shown** - limits, missing comparisons, or anything the claims rest on that the text does not support.
**Check yourself** - three questions a reader should be able to answer after reading the paper. Do not answer them."""

MAX_PARTS = 10


def summary_events(cfg, pages, title):
    limit = budget(cfg)
    parts = parts_of(pages, limit)
    if not parts:
        raise AgentError("This paper has no text the agent can read. It may be a scan.")
    cut = len(parts) > MAX_PARTS
    parts = parts[:MAX_PARTS]
    if len(parts) == 1:
        yield {"t": "status", "text": "Reading the paper"}
        messages = [{"role": "system", "content": READER},
                    {"role": "user", "content": "Paper: %s\n\n%s\n\n%s" % (title, parts[0], SUMMARY_FORM)}]
    else:
        notes = []
        for i, part in enumerate(parts, 1):
            yield {"t": "status", "text": "Reading part %d of %d" % (i, len(parts))}
            notes.append(complete(cfg, [
                {"role": "system", "content": READER},
                {"role": "user", "content": "This is part %d of %d of the paper \"%s\".\n\n%s\n\nIn at most 180 words, note what this part says: "
                 "the problem, the method, each claim with its evidence, and any stated limits. Keep the page numbers." % (i, len(parts), title, part)}]))
        yield {"t": "status", "text": "Writing the summary"}
        joined = "\n\n".join("Notes on part %d:\n%s" % (i, n) for i, n in enumerate(notes, 1))[:limit]
        messages = [{"role": "system", "content": READER},
                    {"role": "user", "content": "These are notes on the consecutive parts of the paper \"%s\".\n\n%s\n\n%s" % (title, joined, SUMMARY_FORM)}]
    for ev in _relay(cfg, messages):
        yield ev
    if cut:
        yield {"t": "delta", "text": "\n\n(Only the first %d parts of this long document were read.)" % MAX_PARTS}


def ask_events(cfg, pages, title, question, history=()):
    if pages:
        picked = best_chunks(chunks(pages), question, k=max(3, min(8, budget(cfg) // 1400)))
        excerpts = "\n\n".join("[p. %d] %s" % (c["page"], c["text"]) for c in picked)
        system = READER + " Answer the question from the excerpts. If they do not contain the answer, say so and say which part of the paper to look at."
        user = "Paper: %s\n\nExcerpts:\n%s\n\nQuestion: %s" % (title, excerpts, question)
    else:
        system = ("You are a patient tutor for a student who is learning Python, algorithms and machine learning by writing everything by hand. "
                  "Explain ideas plainly and briefly, with one small example when it helps. Ask what the student has tried when that would help. "
                  "Do not write full solutions to exercises: the student has asked you not to. If you are not sure of a fact, say so.")
        user = question
    messages = [{"role": "system", "content": system}]
    for turn in list(history)[-6:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": str(turn["content"])[:3000]})
    messages.append({"role": "user", "content": user})
    yield {"t": "status", "text": "Looking through the paper" if pages else "Thinking"}
    for ev in _relay(cfg, messages):
        yield ev


def quiz_events(cfg, pages, title):
    limit = budget(cfg)
    parts = parts_of(pages, limit)
    if not parts:
        raise AgentError("This paper has no text the agent can read. It may be a scan.")
    text = parts[0] if len(parts) == 1 else (parts[0][: limit // 2] + "\n...\n" + parts[-1][-limit // 2:])
    yield {"t": "status", "text": "Writing questions"}
    messages = [{"role": "system", "content": READER},
                {"role": "user", "content": "Paper: %s\n\n%s\n\nWrite five short questions that test whether a reader understood the method and the claims of this paper. "
                 "Number them. Then write a line with only ---, and under it the answers, each with the page it comes from." % (title, text)}]
    for ev in _relay(cfg, messages):
        yield ev


NUDGE = ("You are a tutor for a student who must write the solution alone. Strict rules: never write code, pseudo-code or the steps of the solution. "
         "Never name the technique that solves it. Reply in at most three sentences: first, one plain observation about what the student's code "
         "does on the failing test; then one question that points at the next thing to check. Nothing else.")

CODE_LINE = re.compile(r"^\s*(def |class |for .* in |while |return\b|import |from .* import |if .*:\s*$|elif |else:\s*$|[A-Za-z_][\w.\[\]]* *[+\-*/]?= )")


def no_code(text):
    """Remove anything that looks like code from a nudge. A model that breaks the rule must not get through."""
    text = re.sub(r"```.*?(```|$)", " ", text, flags=re.S)
    kept = [ln for ln in text.split("\n") if not CODE_LINE.match(ln) and not ln.startswith("    ")]
    out = re.sub(r"`[^`\n]{25,}`", "(code removed)", "\n".join(kept)).strip()
    removed = len(out) < len(text.strip()) - 2
    sentences = re.split(r"(?<=[.?!])\s+", out)
    out = " ".join(sentences[:4]).strip()
    if not out:
        return "The model tried to write the solution, which is not what a nudge is for. Open a hint instead."
    return out + ("\n\n(The model also wrote code. It was removed.)" if removed else "")


def nudge_events(cfg, statement, code, failing):
    yield {"t": "status", "text": "Reading your code"}
    user = ("Exercise:\n%s\n\nThe student's code:\n%s\n\nFailing test:\n%s\nExpected output:\n%s\nActual output:\n%s\n%s"
            % (statement[:3000], code[:6000], failing.get("ran", ""), failing.get("expected", ""), failing.get("got", "") or "(nothing printed)",
               ("Error:\n" + failing["error"]) if failing.get("error") else ""))
    text = complete(cfg, [{"role": "system", "content": NUDGE}, {"role": "user", "content": user}], temperature=0.3)
    yield {"t": "delta", "text": no_code(text)}


RECALL = ("You help a learner check what they remember. You get two texts about the same thing. REFERENCE is the learner's own earlier note, "
          "or an answer key. ATTEMPT is what the learner wrote from memory today. Work only from these two texts: add no facts from your own "
          "knowledge, and do not judge whether REFERENCE is correct. Reply in under 120 words, in this form:\n"
          "Missing: up to four short points that are in REFERENCE and absent from ATTEMPT, or the words 'nothing important'.\n"
          "Different: anything ATTEMPT says that disagrees with REFERENCE. Leave this line out if there is nothing.\n"
          "New today: anything in ATTEMPT that REFERENCE does not have. Leave this line out if there is nothing.\n"
          "Then one question that begins with Why or How, about a point the learner did recall.\n"
          "Do not write a corrected version of the attempt.")


def recall_events(cfg, title, reference, attempt):
    yield {"t": "status", "text": "Comparing with your note"}
    user = "Subject: %s\n\nREFERENCE:\n%s\n\nATTEMPT:\n%s" % (title[:600], reference[:6000], attempt[:4000])
    for ev in _relay(cfg, [{"role": "system", "content": RECALL}, {"role": "user", "content": user}]):
        yield ev


def _relay(cfg, messages):
    thinking = False
    for kind, piece in chat(cfg, messages):
        if kind == "think":
            if not thinking:
                thinking = True
                yield {"t": "status", "text": "The model is thinking"}
        elif piece:
            yield {"t": "delta", "text": piece}


def model_class(gb):
    """What size of model fits a GPU with this much memory, at 4-bit, with room left for context."""
    if gb >= 22:
        return "up to about 30 billion parameters"
    if gb >= 15:
        return "14 to 20 billion parameters"
    if gb >= 11:
        return "12 to 14 billion parameters"
    if gb >= 7.5:
        return "7 to 8 billion parameters"
    if gb >= 5.5:
        return "3 to 4 billion parameters"
    if gb > 0:
        return "1 to 3 billion parameters, which is too small for reading papers well"
    return ""
