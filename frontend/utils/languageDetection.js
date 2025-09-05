export async function detectAndValidateLanguage(inputLang, inputText) {
  // Step 0: Basic input validation
  if (!inputText.trim()) {
    return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: "Please enter text or upload an image first.",
    };
  }

  // Regex 1: any alphabetic script word with 2+ letters
  const alphabeticWord = /\p{L}{2,}/u;
  // Regex 2: any single CJK character (Chinese/Japanese/Korean)
  const cjkChar =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

  if (!(alphabeticWord.test(inputText) || cjkChar.test(inputText))) {
    return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: "Please enter valid text with letters or numbers.",
    };
  }

  if (inputText.length > 5000) {
    return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: "Input text is too long. Please limit to 5000 characters.",
    };
  }

  let detectedLang = inputLang;

  // Step 1: Auto-detect language
  if (inputLang === "auto") {
    const detectRes = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/detect-language2`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      }
    );

    const detectData = await detectRes.json();
    if (!detectRes.ok) {
      throw new Error(detectData.detail || "Could not detect language.");
    }

    detectedLang = detectData.detected_lang;

    if (detectData.confidence < 20 || detectedLang === "und") {
      return {
        valid: false,
        detectedLang,
        confidence: detectData.confidence,
        message: `Input is not valid text\nDetected language: ${detectedLang} (confidence: ${detectData.confidence})`,
      };
    }

    return {
      valid: true,
      detectedLang,
      confidence: detectData.confidence,
      message: `Detected language: ${detectedLang} (confidence: ${detectData.confidence})`,
    };
  }

  // Step 2: User selected language
  return {
    valid: true,
    detectedLang: inputLang,
    confidence: 100,
    message: `Source language: ${inputLang}`,
  };
}