"""A small, safe Markdown-to-HTML converter. Standard library only.

It handles the subset the lessons and problem notes use: headings, paragraphs, lists,
fenced code, inline code, bold, emphasis, links, block quotes, rules and simple tables.
Everything else is escaped, so no raw HTML from a content file reaches the page.
Maths written as $...$ or $$...$$ is passed through untouched for the page to typeset.
"""

import html
import re

_INLINE_CODE = re.compile(r"`([^`\n]+)`")
_MATH = re.compile(r"\$\$(.+?)\$\$|\\\[(.+?)\\\]|\\\((.+?)\\\)|(?<![\\$\w])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\w$])", re.S)
_BOLD = re.compile(r"\*\*(?!\s)(.+?)(?<!\s)\*\*")
_EM = re.compile(r"(?<![\*\w])\*(?![\s\*])(.+?)(?<![\s\*])\*(?![\*\w])")
_LINK = re.compile(r"\[([^\]\n]+)\]\((https?://[^)\s]+)\)")
_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_ULI = re.compile(r"^\s*[-*+]\s+(.*)$")
_OLI = re.compile(r"^\s*\d+[.)]\s+(.*)$")
_RULE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")
_TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")


def inline(text):
    """Convert the inline markup of one piece of text."""
    kept = []

    def keep(fragment):
        kept.append(fragment)
        return "\x00%d\x00" % (len(kept) - 1)

    text = _INLINE_CODE.sub(lambda m: keep("<code>%s</code>" % html.escape(m.group(1))), text)
    text = _MATH.sub(lambda m: keep('<span class="tex">%s</span>' % html.escape(m.group(0))), text)
    text = html.escape(text, quote=False)
    text = _LINK.sub(lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>' % (html.escape(m.group(2), quote=True), m.group(1)), text)
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _EM.sub(r"<em>\1</em>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: kept[int(m.group(1))], text)


def _cells(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def render(text):
    """Convert a Markdown document to an HTML fragment."""
    lines = (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out, para, i = [], [], 0

    def flush():
        if para:
            out.append("<p>%s</p>" % inline(" ".join(s.strip() for s in para)))
            del para[:]

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```") or stripped.startswith("~~~"):
            flush()
            fence = stripped[:3]
            body = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith(fence):
                body.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(body)))
            continue

        if stripped.startswith("$$") and not (stripped.endswith("$$") and len(stripped) > 4):
            flush()
            body = [stripped]
            i += 1
            while i < len(lines):
                body.append(lines[i].strip())
                if lines[i].strip().endswith("$$"):
                    i += 1
                    break
                i += 1
            out.append('<div class="tex">%s</div>' % html.escape("\n".join(body)))
            continue

        if not stripped:
            flush()
            i += 1
            continue

        if _RULE.match(line):
            flush()
            out.append("<hr>")
            i += 1
            continue

        m = _HEADING.match(line)
        if m:
            flush()
            level = {1: 3, 2: 3, 3: 4}.get(len(m.group(1)), 5)
            out.append("<h%d>%s</h%d>" % (level, inline(m.group(2)), level))
            i += 1
            continue

        if "|" in line and i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1]) and "-" in lines[i + 1]:
            flush()
            head = _cells(line)
            i += 2
            rows = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append(_cells(lines[i]))
                i += 1
            out.append('<div class="table"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (
                "".join("<th>%s</th>" % inline(c) for c in head),
                "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in rows)))
            continue

        if _ULI.match(line) or _OLI.match(line):
            flush()
            ordered = bool(_OLI.match(line)) and not _ULI.match(line)
            pattern = _OLI if ordered else _ULI
            items = []
            while i < len(lines):
                m = pattern.match(lines[i])
                if m:
                    items.append([m.group(1)])
                elif lines[i].strip() and lines[i][:1] in " \t" and items and not (_ULI.match(lines[i]) or _OLI.match(lines[i])):
                    items[-1].append(lines[i].strip())
                elif lines[i].strip() and (_ULI.match(lines[i]) or _OLI.match(lines[i])) and lines[i][:1] in " \t" and items:
                    sub = (_ULI.match(lines[i]) or _OLI.match(lines[i])).group(1)
                    items[-1].append("<br>&bull; " + sub)
                else:
                    break
                i += 1
            tag = "ol" if ordered else "ul"
            rendered = []
            for parts in items:
                first, rest = parts[0], parts[1:]
                body = inline(first)
                for r in rest:
                    body += (r[:10] == "<br>&bull;" and "<br>&bull; " + inline(r[11:])) or (" " + inline(r))
                rendered.append("<li>%s</li>" % body)
            out.append("<%s>%s</%s>" % (tag, "".join(rendered), tag))
            continue

        if stripped.startswith(">"):
            flush()
            body = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                body.append(lines[i].strip()[1:].strip())
                i += 1
            out.append("<blockquote>%s</blockquote>" % inline(" ".join(body)))
            continue

        para.append(line)
        i += 1

    flush()
    return "\n".join(out)
