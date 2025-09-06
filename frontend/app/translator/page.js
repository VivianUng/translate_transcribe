"use client";

import Select from "react-select";
import { supabase } from '../../lib/supabaseClient';
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { translateText } from "@/utils/translation";
import { startMicRecording, stopRecording } from "@/utils/transcription";
import { extractTextFromImage } from "@/utils/fileProcessing";

export default function Translate() {
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [imageLang, setImageLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [translatedText, setTranslatedText] = useState("");
  const [message, setMessage] = useState("");
  const [ocr_message, setOCRMessage] = useState("");
  const [save_message, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { languages, error } = useLanguages();
  const [previewImage, setPreviewImage] = useState(null);

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const fileInputRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // for react-select component

    // Get initial session
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    fetchSession();

    // Subscribe to auth changes
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    // Cleanup subscription on unmount
    return () => subscription?.subscription?.unsubscribe?.();
  }, []);

  // Handle image upload + preview
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setPreviewImage(URL.createObjectURL(file));
    setOCRMessage("Extracting...");
    setLoading(true);

    try {
      const extractedText = await extractTextFromImage(file);
      setInputText(extractedText);
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
    setOCRMessage("");
    setSaveMessage("");
    setTranslatedText("");

    try {
      const { valid, detectedLang, message } = await detectAndValidateLanguage(
        inputLang,
        inputText
      );
      setMessage(message);

      if (!valid) return;

      setInputLang(detectedLang);

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
      stopRecording({
        recordingType: "mic",
        micRecorderRef,
        setListening,
        setRecordingType: () => { },
      });
    } else {
      try {
        await startMicRecording({
          micRecorderRef,
          audioChunks,
          setListening,
          setRecordingType: () => { },
          onTranscription: (text) => setInputText(text),
          setTranscription: () => { },
        });
      } catch (err) {
        setMessage(err.message || "Transcription failed.");
      }
    }
  }

  async function handleSaveTranslation() {
    if (!isLoggedIn || !translatedText) return;

    setLoading(true);
    setMessage("");
    setSaveMessage("")

    try {
      // get Supabase JWT token from localstorage
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      if (!token) {
        alert("You must be logged in to save translations.");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/save-translation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          input_text: inputText,
          input_lang: inputLang,
          output_text: translatedText,
          output_lang: targetLang,
        }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.detail || "Failed to save translation");

      setSaveMessage("Translation saved Successfully");
    } catch (err) {
      setSaveMessage(err.message || "Failed to save translation.");
    } finally {
      setLoading(false);
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
              onChange={(e) => {
                setInputText(e.target.value);
                setMessage("");   // reset message whenever text changes
              }}
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
              {/* Select language for file upload (to be removed until check if use different ocr lib depending on char type) */}
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
          <div
            className={`translation-result ${!translatedText ? "placeholder" : ""}`}
            tabIndex={0}
          >
            {translatedText || "Translation will appear here...."}
          </div>
        </div>

        {isLoggedIn && translatedText && (
          <div>
            <button
              className="button save-translation-button"
              onClick={handleSaveTranslation}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Translation"}
            </button>

            <div
              className="message save-message"
              role="alert"
              aria-live="assertive"
            >
              {save_message}
            </div>
          </div>

        )}
      </div>
    </>
  );
}