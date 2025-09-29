import langcodes
import pycountry

# Special mappings for Tesseract (ISO639-2 + custom names)
TESSERACT_EXCEPTIONS = {
    "zh-Hans": "chi_sim",
    "zh-Hant": "chi_tra",
    "nb": "nor",   # Norwegian Bokmål
    "he": "heb",  # Hebrew
}

# Special mappings for langdetect → BCP47
LANGDETECT_EXCEPTIONS = {
    "zh-cn": "zh-Hans",
    "zh-tw": "zh-Hant",
    "no": "nb",   # langdetect sometimes outputs "no"
}

LIBRETRANSLATE_EXCEPTIONS = {
    # LibreTranslate → ISO639-1 (or closest equivalent)
    "zh-Hans": "zh",    # Simplified Chinese → zh
    "zh-Hant": "zh",    # Traditional Chinese → zh
    "pt-br": "pt",    # Brazilian Portuguese → pt
    "nb": "no",       # Norwegian Bokmål → no
    # You can add more overrides if needed
}

# Special mappings for PaddleOCR (custom set of names)
# Reference: https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/doc/doc_en/multi_languages_en.md
PADDLE_EXCEPTIONS = {
    "en": "en",           # English
    "ar": "arabic",       # Arabic
    "bg": "cyrillic",     # Bulgarian (falls under cyrillic model)
    "zh-Hans": "ch",      # Simplified Chinese
    "zh-Hant": "chinese_cht", # Traditional Chinese
    "hr": "latin",        # Croatian (latin-based)
    "cs": "latin",        # Czech
    "da": "latin",        # Danish
    "nl": "latin",        # Dutch
    "fi": "latin",        # Finnish
    "fr": "french",       # French
    "de": "german",       # German
    "el": "greek",        # Greek
    "he": "hebrew",       # Hebrew
    "hi": "hindi",        # Hindi
    "hu": "latin",        # Hungarian
    "id": "latin",        # Indonesian
    "it": "italian",      # Italian
    "ja": "japan",        # Japanese
    "ko": "korean",       # Korean
    "ms": "latin",        # Malay
    "fa": "persian",      # Persian
    "pl": "latin",        # Polish
    "pt": "portuguese",   # Portuguese
    "ro": "latin",        # Romanian
    "ru": "cyrillic",     # Russian
    "sr": "cyrillic",     # Serbian (latin also exists but OCR works better in cyrillic model)
    "es": "spanish",      # Spanish
    "sv": "latin",        # Swedish
    "tl": "latin",        # Filipino/Tagalog (latin)
    "tr": "turkish",      # Turkish
    "uk": "cyrillic",     # Ukrainian
    "ur": "urdu",         # Urdu
    "vi": "latin",        # Vietnamese
    # Add other LibreTranslate-supported codes mapped to closest OCR set
}


class LanguageConverter:
    @staticmethod
    def normalize_bcp47(code: str) -> str:
        """Normalize any code to canonical BCP-47 tag"""
        try:
            return langcodes.standardize_tag(code)
        except Exception:
            return code

    @staticmethod
    def to_libretranslate(code: str) -> str:
        """
        Convert any input code to a LibreTranslate-supported code.
        Prefers ISO-639-1 when available, otherwise keeps BCP-47 (zh-Hans, pt-BR).
        """
        norm = LanguageConverter.normalize_bcp47(code)
        lang = langcodes.get(norm)

        # Prefer ISO639-1 if available
        if lang.language and len(lang.language) == 2:
            return lang.language

        # Otherwise keep normalized BCP-47 (needed for zh-Hans, zh-Hant, pt-BR)
        return norm

    @staticmethod
    def from_libretranslate(code: str) -> str:
        """
        Convert a LibreTranslate language code into ISO639-1/Whisper-compatible code.
        """
        code = code.lower()
        if code in LIBRETRANSLATE_EXCEPTIONS:
            return LIBRETRANSLATE_EXCEPTIONS[code]

        # Try to standardize using langcodes
        try:
            lang = langcodes.get(code)
            if lang.language and len(lang.language) == 2:
                return lang.language
        except Exception:
            pass

        return code  # fallback (may already be ISO639-1)

    @staticmethod
    def to_bcp47(code: str) -> str:
        """Ensure conversion to proper BCP-47 tag"""
        return LanguageConverter.normalize_bcp47(code)

    @staticmethod
    def to_tesseract(code: str) -> str | None:
        """
        Convert to a Tesseract-compatible language code.
        Tries special cases first, then ISO-639-2.
        """
        bcp = LanguageConverter.normalize_bcp47(code)
        if bcp in TESSERACT_EXCEPTIONS:
            return TESSERACT_EXCEPTIONS[bcp]

        try:
            lang = langcodes.get(bcp)
            if lang.language:
                pyc_lang = pycountry.languages.get(alpha_2=lang.language)
                return pyc_lang.alpha_3 if pyc_lang else None
        except Exception:
            return None

    @staticmethod
    def from_langdetect(code: str) -> str:
        """
        Convert langdetect code to canonical BCP-47 first.
        Example: zh-cn → zh-Hans, zh-tw → zh-Hant
        """
        if code in LANGDETECT_EXCEPTIONS:
            return LANGDETECT_EXCEPTIONS[code]
        return LanguageConverter.normalize_bcp47(code)
    
    @staticmethod
    def to_paddleocr(code: str) -> str | None:
        """
        Convert to a PaddleOCR-compatible language code.
        Uses predefined mapping (PADDLE_EXCEPTIONS).
        """
        bcp = LanguageConverter.normalize_bcp47(code)
        if bcp in PADDLE_EXCEPTIONS:
            return PADDLE_EXCEPTIONS[bcp]
        # default fallback: try using base language only
        lang = langcodes.get(bcp)
        return PADDLE_EXCEPTIONS.get(lang.language)
