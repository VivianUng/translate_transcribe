"use client";

import Select from "react-select";
import { useState, useRef, useEffect } from "react";

export default function Translate() {
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [imageLang, setImageLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [translatedText, setTranslatedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ocr_message, setOCRMessage] = useState("");
  const [saveTranslation, setSaveTranslation] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);

  const isLoggedIn = false;
  const fileInputRef = useRef(null);

  // Load supported languages
  useEffect(() => {
    async function fetchLanguages() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/languages`);
        if (!res.ok) throw new Error("Failed to load languages");
        const data = await res.json();
        setLanguages([{ value: "auto", label: "Auto-Detect" }, ...data.map(l => ({ value: l.code, label: l.label }))]);
      } catch (err) {
        setMessage("Could not load languages");
      }
    }
    fetchLanguages();
  }, []);

  // Handle image upload + preview
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setPreviewImage(URL.createObjectURL(file));
    setMessage("");
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/extract-text`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to extract text from image");
      const data = await res.json();

      if (!data.extracted_text) throw new Error("No text extracted from image");

      setInputText(data.extracted_text || "");
      setTranslatedText("");
      setOCRMessage("Text extracted from image.");



    } catch (error) {
      setOCRMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function triggerFileInput() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleTranslate() {
    if (!inputText.trim()) {
      setMessage("Please enter text or upload an image first.");
      return;
    }
    // \p{L} = any letter from any language (Latin, Chinese, Arabic, etc.).
    // \p{N} = any digit/number from any language.
    if (!/[\p{L}\p{N}]/u.test(inputText)) {
      setMessage("Please enter valid text with letters or numbers.");
      return;
    }

    if (inputText.length > 5000) {
      setMessage("Input text is too long. Please limit to 5000 characters.");
      return;
    }

    setLoading(true);
    setMessage("");
    setTranslatedText("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          source_lang: inputLang,
          target_lang: targetLang,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Translation failed. Please try again.");
      }

      setTranslatedText(data.translated_text);
    } catch (error) {
      setMessage(error.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="container">
        <h1 className="page-title">Translator</h1>

        <div className="top-row">
          {/* Text Input */}
          <div className="section">
            <div className="translation-header">
              <span>Text / Mic</span>
              <Select
                options={languages}
                value={languages.find(opt => opt.value === inputLang)}
                onChange={(opt) => setInputLang(opt.value)}
                className="flex-1"
              />
            </div>
            <textarea
              rows={8}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type text to translate"
            />
            <div className="mic-icon" title="Microphone (not implemented)">🎙️</div>
          </div>

          {/* File Upload */}
          <div className="section">
            <div className="translation-header">
              <span>File Upload</span>
              <Select
                options={languages}
                value={languages.find(opt => opt.value === imageLang)}
                onChange={(opt) => setImageLang(opt.value)}
                className="flex-1"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />

            {/* Custom upload box */}
            <div>
              <div className="upload-box" onClick={triggerFileInput}>
                {previewImage ? (
                  <img src={previewImage} alt="Preview" className="image-preview" />
                ) : (
                  <span className="upload-text">Click to upload image</span>
                )}
              </div>
              {/* Message displayed below the box */}
              <div className="message ocr-message" role="alert" aria-live="assertive">
                {ocr_message}
              </div>
            </div>
          </div>
        </div>

        <button
          className="button translate-button"
          onClick={handleTranslate}
          disabled={loading || !inputText.trim()}
        >
          {loading ? "Translating..." : "Translate"}
        </button>

        <div className="section" style={{ marginTop: "1rem" }}>
          <div className="translation-header">
            <span>Translation</span>
            <Select
              options={languages.filter(opt => opt.value !== "auto")}
              value={languages.find(opt => opt.value === targetLang)}
              onChange={(opt) => setTargetLang(opt.value)}
              className="flex-1"
            />
          </div>
          <div className="translation-result" tabIndex={0}>
            {translatedText || "Translation will appear here...."}
          </div>
        </div>

        {isLoggedIn && translatedText && (
          <label className="save-checkbox">
            <input
              type="checkbox"
              checked={saveTranslation}
              onChange={(e) => setSaveTranslation(e.target.checked)}
            />
            Save Translation
          </label>
        )}

        <div className="message" role="alert" aria-live="assertive">
          {message}
        </div>
      </div>
    </>
  );
}

