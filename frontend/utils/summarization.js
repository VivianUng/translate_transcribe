// utils/summarization.js
import { translateText } from "./translation";

/**
 * Summarizes the given text and translates if needed.
 * @param {string} text - Text to summarize
 * @param {string} inputLang - Original language of the text
 * @param {string} targetLang - Desired output language for summary
 * @returns {Promise<string>} - Summarized (and translated) text
 */
export async function summarizeText(text, inputLang = "en", targetLang = "en") {
    try {
        let enInput = text;

        // Step 1: Translate input to English if needed
        if (inputLang !== "en") {
            enInput = await translateText(text, inputLang, "en");
        }

        // Step 2: Call backend summarizer in English
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input_text: enInput,
            }),
        });

        const data = await response.json();

        if (!data.summarized_text) {
            throw new Error("No summary returned from server.");
        }

        let summary = data.summarized_text;

        // Step 3: Translate summary to targetLang if needed
        if (targetLang !== "en") {
            summary = await translateText(summary, "en", targetLang);
        }

        return summary;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message);
    }
}