// utils/languageDetection.js
/**
 * Utility functions for text validation and language detection.
 * 
 * This module includes:
 *  - `filterValidText`: Validates input text to ensure it contains meaningful characters.
 *  - `detectAndValidateLanguage`: Performs input validation, language auto-detection (if required),
 *    and checks for text length and quality before translation, summarization, or transcription.
 */


/**
 * Filters and validates the input text to ensure it is meaningful and suitable for processing.
 *
 * The function removes or replaces excessive special characters, checks if the text contains
 * valid letters/numbers, and rejects text with too much noise (eg., mostly symbols).
 *
 * @param {string} inputText - The text to validate and clean.
 * @returns {Object} - An object with:
 *   - `valid`: Boolean indicating whether the text is valid.
 *   - `filteredText`: The cleaned-up version of the text or `null` if invalid.
 */
function filterValidText(inputText) {
  // Reject empty or whitespace-only input
  if (!inputText || !inputText.trim()) {
    return { valid: false, filteredText: null };
  }

  // Must contain at least one letter
  const hasLetter = [...inputText].some(char => /\p{L}/u.test(char));
  if (!hasLetter) {
    return { valid: false, filteredText: null };
  }

  let filteredChars = [];
  let specialSequence = [];

  // Iterate through each character to remove excessive special symbols
  for (const char of inputText) {
    if (/\p{L}|\p{N}/u.test(char)) {
      // If letters or numbers appear, handle any pending special sequence
      if (specialSequence.length > 0) {
        const nonSpaceCount = specialSequence.filter(c => !/\s/.test(c)).length;
        if (nonSpaceCount < 3) {
          // Keep short symbol sequences
          filteredChars.push(...specialSequence);
        } else {
          // Replace removed chunk with a single space
          filteredChars.push(" ");
        }
        specialSequence = [];
      }
      filteredChars.push(char);
    } else if (/\s/.test(char)) {
      // Count spaces in the sequence but ignore for consecutive check
      specialSequence.push(char);
    } else {
      // Special character
      specialSequence.push(char);
    }
  }

  // Flush at the end
  if (specialSequence.length > 0) {
    const nonSpaceCount = specialSequence.filter(c => !/\s/.test(c)).length;
    if (nonSpaceCount < 3) {
      filteredChars.push(...specialSequence);
    } else {
      filteredChars.push(" "); // replace removed chunk with single space
    }
  }

  // Join filtered characters into a cleaned string
  let filteredText = filteredChars.join("");

  // Compare the ratio of removed vs. retained characters
  const originalChars = [...inputText].filter(c => !/\s/.test(c)).length;
  const remainingChars = [...filteredText].filter(c => !/\s/.test(c)).length;
  const removedChars = originalChars - remainingChars;

  // Reject if more than 50% removed
  if (removedChars / originalChars > 0.5) {
    return { valid: false, filteredText };
  }

  return { valid: true, filteredText };
}


/**
 * Validates text input and optionally detects its language.
 *
 * This function performs several checks before proceeding to translation/summarization:
 *  1. Ensures input text is not empty.
 *  2. Enforces source-specific character length limits.
 *  3. Filters invalid or noisy text using `filterValidText`.
 *  4. Auto-detects the input language if `inputLang` is set to `"auto"`.
 *
 * @param {string} source - The feature using the text (eg., "translator", "summarizer", "meetings").
 * @param {string} inputLang - The input language code or "auto" for auto-detection.
 * @param {string} inputText - The user's input text.
 * @returns {Promise<Object>} - A result object containing:
 *   - `valid`: Whether the input is valid.
 *   - `detectedLang`: The detected or user-specified language.
 *   - `filteredText`: The cleaned version of the input text.
 *   - `confidence`: Detection confidence (0–100).
 *   - `message`: Status or error message for user feedback.
 */
export async function detectAndValidateLanguage(source, inputLang, inputText) {
  // Step 1: Reject empty input
  if (!inputText.trim()) {
    return {
      valid: false,
      detectedLang: null,
      filteredText: null,
      confidence: 0,
      message: "Please enter text first.",
    };
  }

  // Step 2: Define maximum allowed input lengths based on feature type
  const limits = {
    translator: 9000,
    summarizer: 30000,
    conversation: 25000,
    meetings: 70000,
    default: 9000,
  };

  const maxLength = limits[source] ?? limits.default;

  // Enforce text length limit
  if (inputText.length > maxLength) {
    return {
      valid: false,
      detectedLang: null,
      filteredText: null,
      confidence: 0,
      message: `Input text is too long. Please limit to ${maxLength.toLocaleString()} characters.`,
    };
  }

  // For summarizer, ensure minimum input size for meaningful results
  const minLengthSummary = 1500;
  if (source === "summarizer") {
    if (inputText.length < minLengthSummary) {
      return {
        valid: false,
        detectedLang: null,
        filteredText: null,
        confidence: 0,
        message: `Input text is too short. Please enter at least ${minLengthSummary.toLocaleString()} characters.`,
      };
    }
  }

  // Step 3: Clean and validate text quality
  const filterRes = filterValidText(inputText);

  if (!filterRes.valid) {
    return {
      valid: false,
      detectedLang: null,
      filteredText: null,
      confidence: 0,
      message: "Please enter valid text with letters or numbers.",
    };
  }

  // Use the filtered text as input
  const filteredText = filterRes.filteredText;

  let detectedLang = inputLang;

  // Step 4: Auto-detect language if user selected "auto"
  if (inputLang === "auto") {
    const detectRes = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/detect-language`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: filteredText }),
      }
    );

    const detectData = await detectRes.json();
    if (!detectRes.ok) {
      throw new Error(detectData.detail || "Could not detect language.");
    }

    detectedLang = detectData.detected_lang;

    // Reject uncertain or unsupported detections
    if (detectData.confidence < 20 || detectedLang === "und") {
      return {
        valid: false,
        detectedLang,
        filteredText,
        confidence: detectData.confidence,
        message:
          detectedLang === "und"
            ? "Could not detect a valid language from the input."
            : detectData.confidence === 0
              ? `Input language (${detectedLang}) is not supported by this system for translation.`
              : detectData.confidence === -1
                ? `Input language (${detectedLang}) was assumed based on script, but could not be confirmed.`
                : `Input is not valid text\nDetected language: ${detectedLang} (confidence: ${detectData.confidence})`,
      };
    }

    // Successful detection
    return {
      valid: true,
      detectedLang,
      filteredText,
      confidence: detectData.confidence,
    };
  }

  // Step 5: User selected language
  return {
    valid: true,
    detectedLang: inputLang,
    filteredText,
    confidence: 100,
  };
}