function filterValidText(inputText) {
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

  for (const char of inputText) {
    if (/\p{L}|\p{N}/u.test(char)) {
      // Flush special sequence
      if (specialSequence.length > 0) {
        const nonSpaceCount = specialSequence.filter(c => !/\s/.test(c)).length;
        if (nonSpaceCount < 3) {
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

  let filteredText = filteredChars.join("");

  // Count non-space characters
  const originalChars = [...inputText].filter(c => !/\s/.test(c)).length;
  const remainingChars = [...filteredText].filter(c => !/\s/.test(c)).length;
  const removedChars = originalChars - remainingChars;

  // Reject if more than 50% removed
  if (removedChars / originalChars > 0.5) {
    return { valid: false, filteredText };
  }

  return { valid: true, filteredText };
}


export async function detectAndValidateLanguage(source, inputLang, inputText) {
  if (!inputText.trim()) {
    return {
      valid: false,
      detectedLang: null,
      filteredText: null,
      confidence: 0,
      message: "Please enter text or upload an image first.",
    };
  }

  const limits = {
    translator: 9000,
    summarizer: 30000,
    conversation: 25000,
    meetings: 70000,
    default: 9000,
  };

  const maxLength = limits[source] ?? limits.default;

  if (inputText.length > maxLength) {
    return {
      valid: false,
      detectedLang: null,
      filteredText: null,
      confidence: 0,
      message: `Input text is too long. Please limit to ${maxLength.toLocaleString()} characters.`,
    };
  }

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

  // Step 1: Auto-detect language
  if (inputLang === "auto") {
    const detectRes = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/detect-language2`,
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

    return {
      valid: true,
      detectedLang,
      filteredText,
      confidence: detectData.confidence,
      // message: `Detected language: ${detectedLang} (confidence: ${detectData.confidence})`,
    };
  }

  // Step 2: User selected language
  return {
    valid: true,
    detectedLang: inputLang,
    filteredText,
    confidence: 100,
  };
}