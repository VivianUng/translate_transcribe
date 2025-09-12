/**
 * Convert ISO 639-1 language codes to BCP-47 language tags.
 * google_recognizer : BCP-47; libretranslate : ISO 639-1
 * Falls back to the input code if no mapping is found.
 *
 * @param {string} code - ISO 639-1 code (e.g. 'en', 'fr', 'zh-cn')
 * @returns {string} - BCP-47 compliant tag (e.g. 'en-US', 'fr-FR', 'zh-Hans')
 */
export function isoToBCP47(code) {
  if (!code) return "en-US"; // default fallback

  const map = {
    "auto": "auto",
    "en": "en-US",     // English → US English
    "fr": "fr-FR",     // French → France
    "es": "es-ES",     // Spanish → Spain
    "de": "de-DE",     // German → Germany
    "it": "it-IT",     // Italian → Italy
    "pt": "pt-PT",     // Portuguese → Portugal
    "pt-br": "pt-BR",  // Brazilian Portuguese
    "ru": "ru-RU",     // Russian → Russia
    "ja": "ja-JP",     // Japanese → Japan
    "ko": "ko-KR",     // Korean → Korea
    "zh": "zh-Hans",   // Chinese (default to Simplified)
    "zh-Hans": "zh-Hans",// Chinese Simplified
    "zh-Hant": "zh-Hant",// Chinese Traditional
    "ar": "ar-SA",     // Arabic → Saudi Arabia
    "hi": "hi-IN",     // Hindi → India
    "bn": "bn-BD",     // Bengali → Bangladesh
    "ms": "ms-MY",     // Malay → Malaysia
    "id": "id-ID",     // Indonesian → Indonesia
    "he": "he-IL",     // Hebrew → Israel
    "iw": "he-IL",     // Old Hebrew code → Israel
    "fa": "fa-IR",     // Persian → Iran
    "tr": "tr-TR",     // Turkish → Turkey
    "th": "th-TH",     // Thai → Thailand
    "vi": "vi-VN",     // Vietnamese → Vietnam
    "fil": "fil-PH",   // Filipino → Philippines
    "tl": "fil-PH",    // Tagalog → Philippines
    "uk": "uk-UA",     // Ukrainian → Ukraine
    "pl": "pl-PL",     // Polish → Poland
    "nl": "nl-NL",     // Dutch → Netherlands
    "sv": "sv-SE",     // Swedish → Sweden
    "no": "no-NO",     // Norwegian → Norway
    "da": "da-DK",     // Danish → Denmark
    "fi": "fi-FI",     // Finnish → Finland
    "cs": "cs-CZ",     // Czech → Czech Republic
    "el": "el-GR",     // Greek → Greece
    "hu": "hu-HU",     // Hungarian → Hungary
    "ro": "ro-RO",     // Romanian → Romania
    "bg": "bg-BG",     // Bulgarian → Bulgaria
    "sr": "sr-RS",     // Serbian → Serbia
  };

  // Normalize input to lowercase for consistency
  const normalized = code.toLowerCase();

  return map[normalized] || normalized;
}

