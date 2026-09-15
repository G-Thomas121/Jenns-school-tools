import json
import io
import unicodedata
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN


THEME_BG = RGBColor(0x1E, 0x29, 0x3B)      # dark slate
THEME_ACCENT = RGBColor(0x3B, 0x82, 0xF6)   # blue
THEME_TEXT = RGBColor(0xF8, 0xFA, 0xFC)     # near-white
THEME_MUTED = RGBColor(0x94, 0xA3, 0xB8)    # slate-400

_UNICODE_MAP = str.maketrans({
    '‘': "'", '’': "'", '‚': "'",
    '“': '"', '”': '"', '„': '"',
    '–': '-', '—': '--', '―': '--',
    '…': '...', ' ': ' ', '•': '-',
    '·': '*', '′': "'", '″': '"',
})

def _safe(text: str) -> str:
    """Normalize Unicode to avoid latin-1 codec errors in python-pptx."""
    if not text:
        return text
    text = text.translate(_UNICODE_MAP)
    text = unicodedata.normalize('NFKC', text)
    return text.encode('latin-1', errors='replace').decode('latin-1')


def _set_bg(slide, color: RGBColor):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _add_textbox(slide, text: str, left, top, width, height, font_size=24, bold=False, color=THEME_TEXT, align=PP_ALIGN.LEFT, wrap=True):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = _safe(text)
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = 'Calibri'
    return txBox


def _add_bullet_box(slide, bullets: list[str], left, top, width, height, font_size=18):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    first = True
    for bullet in bullets:
        if first:
            p = tf.paragraphs[0]
            first = False
        else:
            p = tf.add_paragraph()
        p.level = 0
        run = p.add_run()
        run.text = f"• {_safe(bullet)}"
        run.font.size = Pt(font_size)
        run.font.color.rgb = THEME_TEXT
        run.font.name = 'Calibri'
        p.space_after = Pt(6)


def build_pptx(slides_json: str, title: str = "Presentation") -> bytes:
    try:
        slides = json.loads(slides_json)
    except Exception:
        slides = [{"title": title, "body": [], "notes": "", "type": "title"}]

    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)

    blank_layout = prs.slide_layouts[6]  # blank

    W = prs.slide_width
    H = prs.slide_height
    PAD = Inches(0.6)

    for i, slide_data in enumerate(slides):
        slide = prs.slides.add_slide(blank_layout)
        _set_bg(slide, THEME_BG)

        slide_title = slide_data.get("title", "")
        body = slide_data.get("body", [])
        notes_text = slide_data.get("notes", "")
        slide_type = slide_data.get("type", "content")

        if slide_type == "title" or i == 0:
            # Title slide — centered large text
            _add_textbox(slide, slide_title, PAD, Inches(2.5), W - PAD * 2, Inches(1.5),
                         font_size=40, bold=True, color=THEME_TEXT, align=PP_ALIGN.CENTER)
            if body:
                _add_textbox(slide, body[0], PAD, Inches(4.2), W - PAD * 2, Inches(1),
                             font_size=22, color=THEME_MUTED, align=PP_ALIGN.CENTER)
        else:
            # Accent bar at top
            bar = slide.shapes.add_shape(1, 0, 0, W, Inches(0.08))
            bar.fill.solid()
            bar.fill.fore_color.rgb = THEME_ACCENT
            bar.line.fill.background()

            # Title
            _add_textbox(slide, slide_title, PAD, Inches(0.2), W - PAD * 2, Inches(0.9),
                         font_size=28, bold=True, color=THEME_TEXT)

            # Divider line
            line = slide.shapes.add_shape(1, PAD, Inches(1.2), W - PAD * 2, Pt(1))
            line.fill.solid()
            line.fill.fore_color.rgb = THEME_ACCENT
            line.line.fill.background()

            # Body bullets
            if body:
                _add_bullet_box(slide, body, PAD, Inches(1.4), W - PAD * 2, H - Inches(1.8),
                                font_size=20 if len(body) <= 4 else 17)

        # Slide notes
        if notes_text:
            slide.notes_slide.notes_text_frame.text = _safe(notes_text)

    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf.read()
