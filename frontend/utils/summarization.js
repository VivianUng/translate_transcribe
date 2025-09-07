// utils/summarization.js

/**
 * Summarizes the given text using backend API.
 * @param {string} text - Text to summarize
 * @param {string} targetLang - Language code for output summary
 * @returns {Promise<string>} - Summarized text
 */
export async function summarizeText(text, targetLang = "en") {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input_text: text,
                target_lang: targetLang,
            }),
        });

        const data = await response.json();

        if (data.summarized_text) {
            return data.summarized_text;
        } else {
            throw new Error("No summary returned from server.");
        }
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message);
    }
}
