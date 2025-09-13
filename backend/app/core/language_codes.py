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
