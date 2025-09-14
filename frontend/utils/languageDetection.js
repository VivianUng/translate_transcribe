function isValidText(text) {
  // An empty or whitespace-only string is not considered valid.
  if (!text || !text.trim()) {
    return false;
  }

  // Check if the string contains at least one letter.
  // The \p{L} Unicode  match letters from any language.
  const hasLetter = [...text].some(char => /\p{L}/u.test(char));
  if (!hasLetter) {
    return false;
  }

  // Check for sequences of special characters (not exceeding 3).
  const text_merge = text.replace(/\s/g, "");
  let specialCharCount = 0;

  // Iterate through the string to count consecutive non-alphanumeric characters.
  for (const char of text_merge) {
    if (!char.match(/\p{L}|\p{N}/u)) {
      specialCharCount++;
      if (specialCharCount > 2) {
        return false;
      }
    } else {
      specialCharCount = 0;
    }
  }

  return true;
}



// export async function detectAndValidateLanguage(inputLang, inputText) {
export async function detectAndValidateLanguage(source, inputLang, inputText) {
  if (!inputText.trim()) {
    return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: "Please enter text or upload an image first.",
    };
  }

  const limits = {
    translator: 9000,
    summarizer: 15000,
    conversation: 25000,
    meetings: 70000,
    default: 9000,
  };

  const maxLength = limits[source] ?? limits.default;

  if (inputText.length > maxLength) {
    return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: `Input text is too long. Please limit to ${maxLength.toLocaleString()} characters.`,
    };
  }

  const minLengthSummary = 3000;
  if (source === "summarizer"){
    if (inputText.length < minLengthSummary){
      return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: `Input text is too short. Please enter at least ${minLengthSummary.toLocaleString()} characters.`,
    };
    }
  }

  if (!isValidText(inputText)) {
    return {
      valid: false,
      detectedLang: null,
      confidence: 0,
      message: "Please enter valid text with letters or numbers.",
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