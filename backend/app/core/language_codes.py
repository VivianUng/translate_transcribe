import langcodes
import pycountry

# Libretranslate --> tesseract (ISO639-2 + custom names)
TESSERACT_EXCEPTIONS = {
    "zh-Hans": "chi_sim",
    "zh-Hant": "chi_tra",
    "nb": "nor",
}

# langdetect → libretranslate
LANGDETECT_EXCEPTIONS = {
    "zh-cn": "zh-Hans",
    "zh-tw": "zh-Hant",
}

# LibreTranslate → ISO639-1
LIBRETRANSLATE_EXCEPTIONS = {
    "zh-Hans": "zh",    # Simplified Chinese 
    "zh-Hant": "zh",    # Traditional Chinese
    "pt-br": "pt",    # Brazilian Portuguese
    "nb": "no",       # Norwegian 
}

# ISO639-1 --> paddle (ISO639-1 + custom names)
PADDLE_EXCEPTIONS = {
    "de": "german",       # German
    "ja": "japan",        # Japanese
    "ko": "korean",       # Korean
    "zh": "ch",           # Chinese
}


class LanguageConverter:
    @staticmethod
    def normalize_bcp47(code: str) -> str:
        try:
            return langcodes.standardize_tag(code)
        except Exception:
            return code

    # -------------------------
    # LangDetect → LibreTranslate
    # -------------------------
    @staticmethod
    def from_langdetect(code: str) -> str:
        if code in LANGDETECT_EXCEPTIONS:
            return LANGDETECT_EXCEPTIONS[code]
        return LanguageConverter.normalize_bcp47(code)

    # -------------------------
    # LibreTranslate → others
    # -------------------------
    @staticmethod
    def to_whisper(code: str) -> str:
        # Whisper uses ISO639-1
        if code in LIBRETRANSLATE_EXCEPTIONS:
            return LIBRETRANSLATE_EXCEPTIONS[code]
        lang = langcodes.get(code)
        return lang.language if lang.language else code

    @staticmethod
    def to_paddleocr(code: str) -> str | None:
        # Paddle uses ISO639-1/custom names
        if code in LIBRETRANSLATE_EXCEPTIONS:
            code = LIBRETRANSLATE_EXCEPTIONS[code]
        lang = langcodes.get(code)
        if code in PADDLE_EXCEPTIONS:
            return PADDLE_EXCEPTIONS[code]
        return PADDLE_EXCEPTIONS.get(lang.language)

    @staticmethod
    def to_tesseract(code: str) -> str | None:
        if code in TESSERACT_EXCEPTIONS:
            return TESSERACT_EXCEPTIONS[code]
        if code in LIBRETRANSLATE_EXCEPTIONS:
            code = LIBRETRANSLATE_EXCEPTIONS[code]
        try:
            lang = pycountry.languages.get(alpha_2=code)
            return lang.alpha_3 if lang else None
        except Exception:
            return None

    @staticmethod
    def to_bcp47(code: str) -> str:
        return LanguageConverter.normalize_bcp47(code)

    # -------------------------
    # Universal Convert
    # -------------------------
    @staticmethod
    def convert(code: str, input_source: str, output_source: str) -> str | None:
        """
        Convert language codes dynamically.
        Pivot standard = LibreTranslate
        Sources: libretranslate, langdetect, whisper, tesseract, paddleocr, bcp47
        """
        # Step 1: Input → Libretranslate / BCP
        if input_source == "langdetect":
            libre = LanguageConverter.from_langdetect(code)
        elif input_source == "libretranslate":
            libre = LanguageConverter.normalize_bcp47(code)
        elif input_source == "whisper":
            libre = LanguageConverter.normalize_bcp47(code)
        elif input_source == "paddleocr":
            libre = LanguageConverter.normalize_bcp47(code)
        elif input_source == "bcp47":
            libre = LanguageConverter.normalize_bcp47(code)
        else:
            raise ValueError(f"Unsupported input source: {input_source}")

        # Step 2: BCP → Output
        if output_source == "libretranslate":
            return libre
        elif output_source == "whisper":
            return LanguageConverter.to_whisper(libre)
        elif output_source == "paddleocr":
            return LanguageConverter.to_paddleocr(libre)
        elif output_source == "tesseract":
            return LanguageConverter.to_tesseract(libre)
        elif output_source == "bcp47":
            return LanguageConverter.to_bcp47(libre)
        else:
            raise ValueError(f"Unsupported output source: {output_source}")
