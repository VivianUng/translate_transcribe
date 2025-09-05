export async function translateText(inputText, sourceLang, targetLang) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: inputText,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Translation failed.");
  }

  return data.translated_text;
}
