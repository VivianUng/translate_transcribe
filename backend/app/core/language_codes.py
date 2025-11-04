# backend/app/core/language_codes.py
"""
Language Code Conversion Utility (LanguageConverter class)

This module provides a unified way to convert language codes between various
AI and NLP frameworks that use different code formats.

Supported systems:
- LibreTranslate        --> ISO639-1 / custom names
- LangDetect            --> ISO639-1 codes
- Tesseract OCR         --> ISO639-2 / custom names
- Whisper               --> ISO639-1 codes
- recognize_google      --> BCP-47 codes

Purpose:
To ensure consistent interoperability between translation, transcription,
and text extraction components within the AI-Enhanced Live Transcription & Translation System.
"""
import langcodes        # For normalizing and validating BCP47 language codes
import pycountry        # For ISO639-1 and ISO639-2 language mapping


# Exceptions mappings : custom names for each tool that does not use a standard
# Libretranslate --> tesseract (ISO639-2 + custom names)
TESSERACT_EXCEPTIONS = {
    "zh-Hans": "chi_sim",
    "zh-Hant": "chi_tra",
    "nb": "nor",
}

# langdetect --> libretranslate
LANGDETECT_EXCEPTIONS = {
    "zh-cn": "zh-Hans",
    "zh-tw": "zh-Hant",
}

# LibreTranslate --> ISO639-1
LIBRETRANSLATE_EXCEPTIONS = {
    "zh-Hant": "zh",    # Traditional Chinese
    "zh-Hans": "zh",    # Simplified Chinese 
    "pt-br": "pt",    # Brazilian Portuguese
    "nb": "no",       # Norwegian 
}

# LanguageConverter class
# This is imported into the main modules
class LanguageConverter:
    """
    Provides static methods to convert between language code formats
    used in different frameworks (LibreTranslate, Whisper, etc.).
    """
    @staticmethod
    def normalize_bcp47(code: str) -> str:
        """
        Standardize a language tag into BCP-47 format (e.g., 'en-US').
        BCP-47 is used as the standard because it is the most descriptive
        """
        try:
            return langcodes.standardize_tag(code)
        except Exception:
            return code


    # LangDetect --> Libretranslate
    @staticmethod
    def from_langdetect(code: str) -> str:
        """Convert a LangDetect code (e.g., 'zh-cn') into bcp-47 format."""
        if code in LANGDETECT_EXCEPTIONS:
            return LANGDETECT_EXCEPTIONS[code]
        return LanguageConverter.normalize_bcp47(code)

    # LibreTranslate --> others
    @staticmethod
    def to_libre(code: str) -> str:
        """
        Convert from other formats to LibreTranslate format.
        Handles reverse mappings of LIBRETRANSLATE_EXCEPTIONS.
        """
        # Reverse lookup: e.g. zh -> zh-Hans, pt -> pt-br
        reverse_exceptions = {v: k for k, v in LIBRETRANSLATE_EXCEPTIONS.items()}

        # Check for direct match first
        if code in reverse_exceptions:
            return reverse_exceptions[code]

        # Normalize any valid BCP47 tags
        return LanguageConverter.normalize_bcp47(code)

    @staticmethod
    def to_whisper(code: str) -> str:
        """
        Convert BCP-47 --> Whisper format.
        Whisper uses ISO639-1 two-letter codes.
        """
        # Whisper uses ISO639-1
        if code in LIBRETRANSLATE_EXCEPTIONS:
            return LIBRETRANSLATE_EXCEPTIONS[code]
        lang = langcodes.get(code)
        return lang.language if lang.language else code


    @staticmethod
    def to_tesseract(code: str) -> str | None:
        """
        Convert bcp-47 --> Tesseract language code.
        Example: 'zh-Hans' --> 'chi_sim'
        """
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
        """Convert any code to standardized BCP-47 form."""
        return LanguageConverter.normalize_bcp47(code)


    # Universal Convert (main function)
    @staticmethod
    def convert(code: str, input_source: str, output_source: str) -> str | None:
        """
        Dynamically convert language codes between systems.

        Parameters:
        - code: The language code to convert (e.g., 'en', 'zh-cn').
        - input_source: One of ['libretranslate', 'langdetect', 'whisper', 'bcp47']
        - output_source: One of ['libretranslate', 'whisper', 'tesseract', 'bcp47']

        Returns:
        - A string representing the converted language code.
        """
        # Step 1: Input --> Libretranslate / BCP47
        if input_source == "langdetect":
            libre = LanguageConverter.from_langdetect(code)
        elif input_source == "libretranslate":
            libre = LanguageConverter.normalize_bcp47(code)
        elif input_source == "whisper":
            libre = LanguageConverter.normalize_bcp47(code)
        elif input_source == "bcp47":
            libre = LanguageConverter.normalize_bcp47(code)
        else:
            raise ValueError(f"Unsupported input source: {input_source}")

        # Step 2: BCP --> Output
        if output_source == "libretranslate":
            return LanguageConverter.to_libre(libre)
        elif output_source == "whisper":
            return LanguageConverter.to_whisper(libre)
        elif output_source == "tesseract":
            return LanguageConverter.to_tesseract(libre)
        elif output_source == "bcp47":
            return LanguageConverter.to_bcp47(libre)
        else:
            raise ValueError(f"Unsupported output source: {output_source}")
