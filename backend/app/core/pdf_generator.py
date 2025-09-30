import os
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import regex

# Path to current directory of this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Go into fonts/
FONTS_DIR = os.path.join(BASE_DIR, "fonts")

# --- Register Noto Fonts for different scripts ---
font_files = {
    "NotoSans": "NotoSans-Regular.ttf",                # Latin, Cyrillic, Greek
    "NotoSansArabic": "NotoSansArabic-Regular.ttf",
    "NotoSansHebrew": "NotoSansHebrew-Regular.ttf",
    "NotoSansDevanagari": "NotoSansDevanagari-Regular.ttf", # Hindi
    "NotoSansBengali": "NotoSansBengali-Regular.ttf",
    "NotoSansThai": "NotoSansThai-Regular.ttf",
    "NotoSansCJKsc": "NotoSansSC-Regular.ttf",         # Simplified Chinese
    "NotoSansCJKtc": "NotoSansTC-Regular.ttf",         # Traditional Chinese
    "NotoSansCJKjp": "NotoSansJP-Regular.ttf",         # Japanese
    "NotoSansCJKkr": "NotoSansKR-Regular.ttf",         # Korean
}

for name, file in font_files.items():
    path = os.path.abspath(os.path.join(FONTS_DIR, file))
    if os.path.exists(path):
        pdfmetrics.registerFont(TTFont(name, path))
    else:
        print(f"[WARN] Font not found: {path}")


# --- Font mapping ---
font_map = {
    "AR": "NotoSansArabic",
    "HE": "NotoSansHebrew",
    "DEV": "NotoSansDevanagari",
    "BN": "NotoSansBengali",
    "TH": "NotoSansThai",
    "CJK-SC": "NotoSansCJKsc",
    "CJK-TC": "NotoSansCJKtc",
    "JP": "NotoSansCJKjp",
    "KR": "NotoSansCJKkr",
    "LATIN": "NotoSans"
}
script_patterns = {
    "AR": r"\p{Arabic}",
    "HE": r"\p{Hebrew}",
    "DEV": r"\p{Devanagari}",
    "BN": r"\p{Bengali}",
    "TH": r"\p{Thai}",
    "CJK-SC": r"\p{Han}",
    "JP": r"[\p{Hiragana}\p{Katakana}]",
    "KR": r"\p{Hangul}",
    "LATIN": r"\p{Cyrillic}",
    "LATIN": r"\p{Greek}"
}

def detect_script(ch: str) -> str:
    for script, pattern in script_patterns.items():
        if regex.match(pattern, ch):
            return script
    return "LATIN"


# --- Segment text into runs of same script ---
def segment_text(text: str):
    if not text:
        return []
    segments = []
    current_script = detect_script(text[0])
    buffer = text[0]

    for ch in text[1:]:
        script = detect_script(ch)
        if script != current_script:
            segments.append((buffer, current_script))
            buffer = ch
            current_script = script
        else:
            buffer += ch
    segments.append((buffer, current_script))
    return segments

# --- Build mixed-script paragraph ---
def mixed_paragraph(text: str, style):
    segments = segment_text(text)
    html_chunks = []
    for seg, script in segments:
        font = font_map.get(script, "NotoSans")
        html_chunks.append(f'<font name="{font}">{seg}</font>')
    return Paragraph("".join(html_chunks), style)

def select_font(text: str) -> str:
    script = detect_script(text)
    return font_map.get(script, "NotoSans")

def generate_pdf(content_dict, filename="output.pdf"):
    doc = SimpleDocTemplate(filename, pagesize=A4)
    styles = getSampleStyleSheet()

    flowables = []
    for key, value in content_dict.items():
        # Heading in default Latin font
        heading_style = ParagraphStyle(
            "Heading",
            parent=styles["Heading2"],
            fontName="NotoSans",
            fontSize=14,
            spaceAfter=10,
        )
        flowables.append(Paragraph(f"<b>{key}</b>", heading_style))

        # Body with mixed-script handling
        normal_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName="NotoSans",  # fallback
            fontSize=12,
            leading=15,
        )
        flowables.append(mixed_paragraph(str(value), normal_style))
        flowables.append(Spacer(1, 12))

    doc.build(flowables)