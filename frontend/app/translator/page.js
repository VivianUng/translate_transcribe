"use client";

import Select from "react-select";
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { translateText } from "@/utils/translation";
import { startMicRecording, stopRecording } from "@/utils/transcription";


export default function Translate() {
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [imageLang, setImageLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [translatedText, setTranslatedText] = useState("");
  const [message, setMessage] = useState("");
  const [ocr_message, setOCRMessage] = useState("");
  const [saveTranslation, setSaveTranslation] = useState(false);
  const [loading, setLoading] = useState(false);
  const { languages, error } = useLanguages();
  const [previewImage, setPreviewImage] = useState(null);

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const isLoggedIn = false;
  const fileInputRef = useRef(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle image upload + preview
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setPreviewImage(URL.createObjectURL(file));
    setOCRMessage("Extracting...");

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
    setLoading(true);
    setMessage("");
    setTranslatedText("");

    try {
      // Step 1: Detect + validate language
      const { valid, detectedLang, message } = await detectAndValidateLanguage(
        inputLang,
        inputText
      );

      setMessage(message); // language detection feedback

      if (!valid) return;

      setInputLang(detectedLang);
      // Step 2: Translate using utils
      const translated = await translateText(inputText, detectedLang, targetLang);
      setTranslatedText(translated);
    } catch (error) {
      setMessage(error.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }


  async function handleMicInput() {
    if (listening) {
      // stop recording
      stopRecording({
        recordingType: "mic",
        micRecorderRef,
        setListening,
        setRecordingType: () => { },
      });
    } else {
      // start recording
      try {
        await startMicRecording({
          micRecorderRef,
          audioChunks,
          setListening,
          setRecordingType: () => { },
          onTranscription: (text) => {
            setInputText(text); // put transcription into textarea
          },
          setTranscription: () => { },
        });
      } catch (err) {
        setMessage(err.message || "Transcription failed.");
      }
    }
  }



  return (
    <>
      <div className="container">
        <h1 className="page-title">Translator</h1>

        <div className="translator-top-row">
          {/* Text Input */}
          <div className="section">
            <div className="section-header">
              <span>Text / Mic</span>
              {mounted && (
                <Select
                  options={languages}
                  value={languages.find((opt) => opt.value === inputLang)}
                  onChange={(opt) => setInputLang(opt.value)}
                  className="flex-1"
                />
              )}
            </div>
            <textarea
              className="input-text-area"
              rows={8}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type text to translate"
            />
            <div
              className="mic-icon"
              title={listening ? "Stop Recording" : "Start Recording"}
              onClick={handleMicInput}
            >
              {listening ? "⏹️" : "🎙️"}
            </div>

            {/* Message displayed below the box */}
            <div className="message" role="alert" aria-live="assertive">
              {message}
            </div>
          </div>

          {/* File Upload */}
          <div className="section">
            <div className="section-header">
              <span>File Upload</span>
              {mounted && (
                <Select
                  options={languages}
                  value={languages.find((opt) => opt.value === imageLang)}
                  onChange={(opt) => setImageLang(opt.value)}
                  className="flex-1"
                />
              )}
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
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="image-preview"
                  />
                ) : (
                  <span className="upload-text">Click to upload image</span>
                )}
              </div>
              {/* Message displayed below the box */}
              <div
                className="message ocr-message"
                role="alert"
                aria-live="assertive"
              >
                {ocr_message}
              </div>
            </div>
          </div>
        </div>

        <button
          className="button translate-button"
          onClick={handleTranslate}
          disabled={loading || !inputText || !inputText.trim()}
        >
          {loading ? "Translating..." : "Translate"}
        </button>

        <div className="section" style={{ marginTop: "1rem" }}>
          <div className="section-header">
            <span>Translation</span>
            {mounted && (
              <Select
                options={languages.filter((opt) => opt.value !== "auto")}
                value={languages.find((opt) => opt.value === targetLang)}
                onChange={(opt) => setTargetLang(opt.value)}
                className="flex-1"
              />
            )}
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
      </div>
    </>
  );
}