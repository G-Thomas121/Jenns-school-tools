"""
slides.md → .pptx for Canva. Canva imports PowerPoint files as editable designs, so this is
how a slide outline gets into Canva without retyping it.

The markdown is converted as-is, with no model involved: each `## Slide N — Title` section
becomes a slide, `> Notes:` becomes speaker notes, and bullets, numbered lists, tables and
bold/italic come through as real, editable formatting. Styling is deliberately plain (white
background, dark text, the default font) so a Canva Style can restyle every page at once.
"""
import io
import math
import re
from dataclasses import dataclass, field

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_AUTO_SIZE
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

SLIDE_W, SLIDE_H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.6)
TITLE_TOP, TITLE_H, TITLE_SIZE = Inches(0.4), Inches(1.0), 36
BODY_TOP, BODY_BOTTOM = Inches(1.6), Inches(7.0)
BLOCK_GAP = Inches(0.2)
BODY_SIZES = (28, 24, 22, 20, 18, 16, 14, 12)  # largest that fits wins
INDENT = Inches(0.35)
CELL_MARGIN = Inches(0.1)  # PowerPoint's default left/right cell margin
MIN_COLUMN_SHARE = 0.12
TEXT_COLOR = RGBColor(0x1F, 0x29, 0x37)

_SLIDE_PREFIX = re.compile(r"^Slide\s+\d+\s*[—–:-]\s*", re.IGNORECASE)
_BULLET = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_NUMBERED = re.compile(r"^(\s*)(\d+)[.)]\s+(.*)$")
_TABLE_RULE = re.compile(r"^\|?\s*:?-{2,}")
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_CODE = re.compile(r"`([^`]*)`")


class SlidesError(Exception):
    pass


@dataclass
class Para:
    text: str               # inline markdown (bold/italic) still in place
    bullet: bool = False
    level: int = 0
    heading: bool = False


@dataclass
class Table:
    rows: list[list[str]]


@dataclass
class Slide:
    title: str
    blocks: list = field(default_factory=list)
    notes: str = ""


# ── Parsing ────────────────────────────────────────────────────────────────────

def parse(markdown: str) -> list[Slide]:
    slides: list[Slide] = []
    slide, in_notes, table = None, False, None
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if line.startswith("## "):
            slide = Slide(title=plain(_SLIDE_PREFIX.sub("", line[3:].strip())))
            slides.append(slide)
            in_notes, table = False, None
            continue
        if slide is None:
            continue  # the deck's # title and anything before the first slide

        if line.startswith("|"):
            if _TABLE_RULE.match(line):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if table is None:
                table = Table(rows=[])
                slide.blocks.append(table)
            table.rows.append(cells)
            continue
        table = None

        quoted = re.match(r"^>\s?(.*)$", line)
        if quoted and re.match(r"^\*{0,2}Notes:\*{0,2}", quoted.group(1), re.IGNORECASE):
            in_notes = True
            note = re.sub(r"^\*{0,2}Notes:\*{0,2}\s*", "", quoted.group(1), flags=re.IGNORECASE)
            slide.notes = plain(note)
            continue
        if quoted and in_notes:
            slide.notes = f"{slide.notes}\n{plain(quoted.group(1))}".strip()
            continue
        in_notes = False

        if not line.strip() or re.match(r"^\s*(-{3,}|\*{3,})\s*$", line):
            continue
        if m := _BULLET.match(line):
            slide.blocks.append(Para(m.group(2), bullet=True, level=min(len(m.group(1)) // 2, 4)))
        elif m := _NUMBERED.match(line):
            slide.blocks.append(Para(f"{m.group(2)}. {m.group(3)}", level=min(len(m.group(1)) // 2, 4)))
        elif m := re.match(r"^#{3,6}\s+(.*)$", line):
            slide.blocks.append(Para(m.group(1), heading=True))
        else:
            slide.blocks.append(Para(quoted.group(1) if quoted else line.strip()))
    return slides


def runs(text: str) -> list[tuple[str, bool, bool]]:
    """Inline markdown → (text, bold, italic) runs. Only * and ** count as emphasis;
    underscores are left alone because worksheets use ____ for blanks."""
    text = _CODE.sub(r"\1", _LINK.sub(r"\1", _IMAGE.sub("", text))).strip()
    tokens = re.split(r"(\*\*|\*)", text)
    # A marker without a partner is just a literal asterisk.
    unpaired = {m for m in ("**", "*") if tokens.count(m) % 2}
    last = {m: max(i for i, t in enumerate(tokens) if t == m) for m in unpaired}
    out, bold, italic = [], False, False
    for i, tok in enumerate(tokens):
        if tok == "**" and last.get("**") != i:
            bold = not bold
        elif tok == "*" and last.get("*") != i:
            italic = not italic
        elif tok:
            if out and out[-1][1:] == (bold, italic):
                out[-1] = (out[-1][0] + tok, bold, italic)
            else:
                out.append((tok, bold, italic))
    return out


def plain(text: str) -> str:
    return "".join(t for t, _, _ in runs(text))


# ── Layout ─────────────────────────────────────────────────────────────────────

def _lines(text: str, width: int, size: int) -> int:
    # An average glyph is a bit over half the font size; err on the side of more lines,
    # since words wrap whole.
    chars_per_line = max(6, int(width / Pt(size) * 1.7))
    return max(1, math.ceil(len(plain(text)) / chars_per_line))


def _para_height(p: Para, width: int, size: int) -> int:
    return Pt(size) * 1.2 * _lines(p.text, width - INDENT * (p.level + p.bullet), size) + Pt(size) * 0.3


def _column_widths(table: Table, width: int, size: int) -> list[int]:
    """Each column gets room for its longest word (words don't break), then the rest is
    shared by how much text each column holds, so a column of numbers doesn't take as much
    room as a column of sentences."""
    cols = max(len(r) for r in table.rows)
    cells = [[plain(r[c]) if c < len(r) else "" for r in table.rows] for c in range(cols)]
    longest_word = [max((len(w) for cell in col for w in cell.split()), default=0) for col in cells]
    floors = [max(int(width * MIN_COLUMN_SHARE), math.ceil(n * Pt(size) / 1.7) + 2 * CELL_MARGIN) for n in longest_word]
    if sum(floors) >= width:
        widths = [int(width * f / sum(floors)) for f in floors]
    else:
        extra = [max(0, max(map(len, col)) - n) for col, n in zip(cells, longest_word)]
        spare = width - sum(floors)
        widths = [f + int(spare * e / (sum(extra) or 1)) if sum(extra) else f + spare // cols
                  for f, e in zip(floors, extra)]
    widths[-1] += width - sum(widths)
    return widths


def _table_row_height(row: list[str], widths: list[int], size: int) -> int:
    lines = max(_lines(row[c] if c < len(row) else "", w - 2 * CELL_MARGIN, size) for c, w in enumerate(widths))
    return Pt(size) * 1.2 * lines + Inches(0.15)


def _groups(blocks: list) -> list:
    """Runs of paragraphs become one text box; tables stand alone."""
    groups = []
    for b in blocks:
        if isinstance(b, Para) and groups and isinstance(groups[-1], list):
            groups[-1].append(b)
        else:
            groups.append([b] if isinstance(b, Para) else b)
    return groups


def _group_height(group, width: int, size: int) -> int:
    if isinstance(group, list):
        return sum(_para_height(p, width, size) for p in group) + Inches(0.1)
    widths = _column_widths(group, width, size)
    return sum(_table_row_height(r, widths, size) for r in group.rows)


def _fit(groups: list, width: int) -> int:
    room = BODY_BOTTOM - BODY_TOP
    for size in BODY_SIZES:
        total = sum(_group_height(g, width, size) for g in groups) + BLOCK_GAP * (len(groups) - 1)
        if total <= room:
            return size
    return BODY_SIZES[-1]


# ── Rendering ──────────────────────────────────────────────────────────────────

def _add_runs(paragraph, text: str, size: int, *, bold: bool = False) -> None:
    for chunk, b, i in runs(text):
        r = paragraph.add_run()
        r.text = chunk
        r.font.size = Pt(size)
        r.font.bold = b or bold
        r.font.italic = i
        r.font.color.rgb = TEXT_COLOR


def _set_bullet(paragraph, p: Para) -> None:
    paragraph.level = p.level
    ppr = paragraph._p.get_or_add_pPr()
    if p.bullet:
        ppr.set("marL", str(int(INDENT * (p.level + 1))))
        ppr.set("indent", str(int(-INDENT * 0.85)))
        bu = ppr.makeelement(qn("a:buChar"), {"char": "•"})
    else:
        ppr.set("marL", str(int(INDENT * p.level)))
        ppr.set("indent", "0")
        bu = ppr.makeelement(qn("a:buNone"), {})
    ppr.append(bu)


def _text_box(slide, left, top, width, height):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return tf


def _render_slide(prs, s: Slide) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    width = SLIDE_W - 2 * MARGIN

    title = _text_box(slide, MARGIN, TITLE_TOP, width, TITLE_H)
    _add_runs(title.paragraphs[0], s.title, TITLE_SIZE, bold=True)

    groups = _groups(s.blocks)
    size = _fit(groups, width)
    top = BODY_TOP
    for group in groups:
        height = min(_group_height(group, width, size), max(BODY_BOTTOM - top, Inches(0.3)))
        if top + height > SLIDE_H:
            break  # nothing fits below; Canva will show what's here and Jenn can trim
        if isinstance(group, list):
            tf = _text_box(slide, MARGIN, top, width, height)
            for i, p in enumerate(group):
                para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                _set_bullet(para, p)
                para.space_after = Pt(size * 0.3)
                _add_runs(para, p.text, size + 2 if p.heading else size, bold=p.heading)
        else:
            widths = _column_widths(group, width, size)
            cols = len(widths)
            shape = slide.shapes.add_table(len(group.rows), cols, MARGIN, top, width, height)
            for c, w in enumerate(widths):
                shape.table.columns[c].width = Emu(w)
            for r, row in enumerate(group.rows):
                shape.table.rows[r].height = Emu(_table_row_height(row, widths, size))
                for c in range(cols):
                    cell_tf = shape.table.cell(r, c).text_frame
                    _add_runs(cell_tf.paragraphs[0], row[c] if c < len(row) else "", size)
        top += height + BLOCK_GAP

    if s.notes:
        slide.notes_slide.notes_text_frame.text = s.notes


def to_pptx(markdown: str) -> bytes:
    slides = parse(markdown)
    if not slides:
        raise SlidesError("This file has no slides. Each slide starts with a heading like "
                          "“## Slide 1 — Bell Ringer”.")
    prs = Presentation()
    prs.slide_width, prs.slide_height = SLIDE_W, SLIDE_H
    if m := re.search(r"^# (.+)$", markdown, re.MULTILINE):
        prs.core_properties.title = plain(m.group(1))
    for s in slides:
        _render_slide(prs, s)
    out = io.BytesIO()
    prs.save(out)
    return out.getvalue()
