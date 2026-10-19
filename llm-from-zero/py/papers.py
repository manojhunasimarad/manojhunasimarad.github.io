"""The reading shelf: PDFs you upload or fetch by link, kept in app/data/papers.

The PDF itself is shown by your browser. To let the agent read a paper its text has to be taken
out of the PDF, which needs one of:
    pip install pypdf          (any system)
    the pdftotext program      (comes with poppler; on most Linux systems already)
Without either, papers can still be added, read and annotated; only the agent cannot read them.
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 80 * 1024 * 1024


class PaperError(Exception):
    pass


def normalise(url):
    """Turn the address of a paper's web page into the address of its PDF, for the sites this plan links to."""
    url = url.strip()
    if not re.match(r"https?://", url):
        if re.fullmatch(r"\d{4}\.\d{4,5}(v\d+)?", url):          # a bare arXiv number
            return "https://arxiv.org/pdf/" + url
        url = "https://" + url
    m = re.match(r"https?://(?:www\.)?arxiv\.org/(?:abs|pdf)/([^?#]+?)(?:\.pdf)?(?:[?#].*)?$", url)
    if m:
        return "https://arxiv.org/pdf/" + m.group(1)
    m = re.match(r"https?://huggingface\.co/papers/(\d{4}\.\d{4,5})", url)
    if m:
        return "https://arxiv.org/pdf/" + m.group(1)
    m = re.match(r"https?://openreview\.net/forum\?id=([\w-]+)", url)
    if m:
        return "https://openreview.net/pdf?id=" + m.group(1)
    return url


def fetch(url):
    url = normalise(url)
    if urllib.parse.urlparse(url).scheme not in ("http", "https"):
        raise PaperError("Only http and https addresses can be fetched.")
    req = urllib.request.Request(url, headers={"User-Agent": "llm-from-zero (a local study app)", "Accept": "application/pdf,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise PaperError("The site answered with an error (%s). Download the PDF in your browser and upload it instead." % e.code)
    except (urllib.error.URLError, OSError) as e:
        raise PaperError("Could not reach that address (%s). If you are offline, upload the PDF instead." % getattr(e, "reason", e))
    if len(data) > MAX_BYTES:
        raise PaperError("That file is larger than 80 MB.")
    if b"%PDF-" not in data[:1024]:
        raise PaperError("That address did not return a PDF. Open it in your browser, download the PDF and upload it here.")
    return data, url


def extract(path):
    """Return (pages, title from the file, tool used). `pages` is a list with the text of each page."""
    try:
        from pypdf import PdfReader
    except ImportError:
        PdfReader = None
    if PdfReader is not None:
        try:
            reader = PdfReader(path)
            pages = []
            for p in reader.pages:
                try:
                    pages.append(p.extract_text() or "")
                except Exception:
                    pages.append("")
            title = ""
            try:
                title = (reader.metadata.title or "") if reader.metadata else ""
            except Exception:
                pass
            return pages, str(title).strip(), "pypdf"
        except Exception:
            pass
    tool = shutil.which("pdftotext")
    if tool:
        try:
            r = subprocess.run([tool, "-enc", "UTF-8", path, "-"], capture_output=True, timeout=120)
            if r.returncode == 0:
                pages = r.stdout.decode("utf-8", "replace").split("\f")
                if pages and not pages[-1].strip():
                    pages.pop()
                return pages, "", "pdftotext"
        except (OSError, subprocess.SubprocessError):
            pass
    return [], "", ""


def guess_title(pages, meta_title, fallback):
    t = re.sub(r"\s+", " ", meta_title or "").strip()
    if len(t) > 8 and not re.match(r"(untitled|microsoft word|arxiv:|\d+$)", t.lower()) and not t.lower().endswith((".pdf", ".tex", ".dvi", ".doc", ".docx")):
        return t[:200]
    for line in (pages[0] if pages else "").split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) > 12 and not re.match(r"(arxiv:|published|proceedings|preprint|under review|\d)", line.lower()):
            return line[:200]
    return fallback[:200]


def store(folder, data, name_hint="", source=""):
    """Save a PDF and its text. Returns the fields for the shelf."""
    if b"%PDF-" not in data[:1024]:
        raise PaperError("That file is not a PDF.")
    if len(data) > MAX_BYTES:
        raise PaperError("That file is larger than 80 MB.")
    os.makedirs(folder, exist_ok=True)
    pid = hashlib.sha1(data).hexdigest()[:12]
    path = os.path.join(folder, pid + ".pdf")
    if not os.path.isfile(path):
        with open(path, "wb") as f:
            f.write(data)
    pages, meta_title, tool = extract(path)
    with open(os.path.join(folder, pid + ".pages.json"), "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    fallback = re.sub(r"\.pdf$", "", os.path.basename(name_hint or source or "Untitled paper"), flags=re.I) or "Untitled paper"
    chars = sum(len(p) for p in pages)
    return {"id": pid, "title": guess_title(pages, meta_title, fallback), "pages": len(pages), "chars": chars,
            "tool": tool, "status": "text" if chars > 400 else ("scan" if tool else "no_tool")}


def pages_of(folder, pid):
    p = os.path.join(folder, pid + ".pages.json")
    if not os.path.isfile(p):
        return []
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def remove(folder, pid):
    for ending in (".pdf", ".pages.json"):
        p = os.path.join(folder, pid + ending)
        if os.path.isfile(p):
            os.remove(p)
