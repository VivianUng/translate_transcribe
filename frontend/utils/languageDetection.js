export async function detectAndValidateLanguage(inputLang, inputText) {
  let detectedLang = inputLang;

  if (inputLang === "auto") {
    const detectRes = await fetch(
      // `${process.env.NEXT_PUBLIC_BACKEND_URL}/detect-language`, // libretranslate detect
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/detect-language2`, // langdetect
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

  // User picked a language
  return {
    valid: true,
    detectedLang: inputLang,
    confidence: 100,
    message: `Source language: ${inputLang}`,
  };
}
