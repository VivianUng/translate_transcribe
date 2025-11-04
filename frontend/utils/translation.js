/**
 * Sends text to the backend translation API and retrieves the translated result.
 *
 * @param {string} inputText - The text to be translated.
 * @param {string} sourceLang - The source language code (in libretranslate format).
 * @param {string} targetLang - The target language code (in libretranslate format).
 * @returns {Promise<string>} - The translated text returned from the backend.
 * @throws {Error} - Throws an error if the API request fails or returns an error response.
 */
export async function translateText(inputText, sourceLang, targetLang) {
  // Send a POST request to the backend /translate endpoint
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: inputText,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  // Parse the JSON response from the backend
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Translation failed.");
  }

  // Return the translated text extracted from the backend response
  return data.translated_text;
}
