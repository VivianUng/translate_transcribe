# backend/app/core/pdf_generator.py
"""
PDF Generator Utility

This module handles multilingual PDF generation using the ReportLab library with support
for various language scripts (eg., Arabic, Chinese, Japanese, Korean, Hindi, etc.) through 
Noto Sans fonts. It detects the script of each character and applies the appropriate font to 
ensure correct rendering of multilingual text.

Features:
- Register Noto Sans fonts for multiple languages/scripts
- Automatically detect text script (e.g., Arabic, Thai, CJK, etc.)
- Segment text by script and render with mixed fonts
- Generate structured PDF files with proper multilingual support
"""
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

# Register Noto Fonts for different scripts
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


# Font mapping
# Maps script codes to their corresponding registered fonts.
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

# Regular expression patterns for detecting scripts in text
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
    """
    Detect the writing script of a given character.

    Parameters:
        ch (str): Single character to identify the script for.

    Returns:
        str: Script code (e.g., 'AR', 'CJK-SC', 'JP', etc.) or 'LATIN' if not matched.
    """
    for script, pattern in script_patterns.items():
        if regex.match(pattern, ch):
            return script
    return "LATIN"


# Segment text into runs of same script
def segment_text(text: str):
    """
    Segment text into groups where each group contains characters from the same script.

    Parameters:
        text (str): Input string containing multilingual text.

    Returns:
        list[tuple[str, str]]: A list of (text_segment, script_code) tuples.
    """
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

# Build mixed-script paragraph
def mixed_paragraph(text: str, style):
    """
    Build a multilingual paragraph with correct fonts applied per script.

    Parameters:
        text (str): Input text with mixed languages.
        style (ParagraphStyle): ReportLab paragraph style to apply.

    Returns:
        Paragraph: A styled Paragraph object with correct fonts applied for each script.
    """
    segments = segment_text(text)
    html_chunks = []
    for seg, script in segments:
        font = font_map.get(script, "NotoSans")
        html_chunks.append(f'<font name="{font}">{seg}</font>')
    return Paragraph("".join(html_chunks), style)


def generate_pdf(content_dict, filename="output.pdf"):
    """
    Generate a multilingual PDF document from structured content.

    Steps:
        1. Create a SimpleDocTemplate with A4 page size.
        2. Iterate through content_dict to add headings and body paragraphs.
        3. Detect and apply appropriate fonts for mixed-script text.
        4. Build and save the final PDF file.

    Parameters:
        content_dict (dict): Key-value pairs where keys are section titles and values are text content.
        filename (str): Output PDF filename (default: 'output.pdf').
    """
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