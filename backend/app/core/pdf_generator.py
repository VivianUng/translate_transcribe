from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch

def generate_pdf(content_dict, filename, input_language="en", output_language="en"):
    # --- Step 1: Choose fonts based on language ---
    font_map = {
        "en": "Helvetica",          # English / Latin
        "fr": "Helvetica",          # French
        "es": "Helvetica",          # Spanish
        "de": "Helvetica",          # German
        "zh-Hans": "STSong-Light",  # Simplified Chinese
        "zh-Hant": "MSung-Light",   # Traditional Chinese
        "ja": "HeiseiMin-W3",       # Japanese
        "ko": "HYSMyeongJo-Medium", # Korean
    }

    input_font = font_map.get(input_language, "Helvetica")
    output_font = font_map.get(output_language, "Helvetica")

    # Register CID fonts only when needed
    for font in {input_font, output_font}:
        if font in ["STSong-Light", "MSung-Light", "HeiseiMin-W3", "HYSMyeongJo-Medium"]:
            pdfmetrics.registerFont(UnicodeCIDFont(font))

    # --- Step 2: Setup document ---
    doc = SimpleDocTemplate(filename, pagesize=A4)
    styles = getSampleStyleSheet()

    def make_styles(font_name):
        return {
            "normal": ParagraphStyle(
                "CustomNormal",
                parent=styles["Normal"],
                fontName=font_name,
                fontSize=12,
                leading=15,
            ),
            "heading": ParagraphStyle(
                "CustomHeading",
                parent=styles["Heading2"],
                fontName=font_name,
                fontSize=14,
                spaceAfter=10,
            ),
        }

    input_styles = make_styles(input_font)
    output_styles = make_styles(output_font)

    # --- Step 3: Build PDF content ---
    flowables = []
    for key, value in content_dict.items():
        # Choose font depending on key
        if key.lower() in ["input", "transcription"]:
            styles_to_use = input_styles
        elif key.lower() in ["output", "translation", "translated"]:
            styles_to_use = output_styles
        else:
            # default to output font if unknown
            styles_to_use = output_styles

        flowables.append(Paragraph(f"<b>{key}</b>", styles_to_use["heading"]))
        flowables.append(Paragraph(str(value), styles_to_use["normal"]))
        flowables.append(Spacer(1, 0.3 * inch))

    doc.build(flowables)