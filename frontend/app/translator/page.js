"use client";

import Select from "react-select";
import { toast } from "react-hot-toast";
import { supabase } from '../../lib/supabaseClient';
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { translateText } from "@/utils/translation";
import { startMicRecording, stopRecording } from "@/utils/transcription";
import { extractTextFromImage } from "@/utils/fileProcessing";

export default function Translate() {
  const { LoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
  const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_translations",]);
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [imageLang, setImageLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [translatedText, setTranslatedText] = useState("");
  const [message, setMessage] = useState("");
  const [ocr_message, setOCRMessage] = useState("");
  const [save_message, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { languages, error } = useLanguages();
  const [previewImage, setPreviewImage] = useState(null);
  const [autoSave, setAutoSave] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // track if translation is saved

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const fileInputRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const ensureProfile = async (user) => {
      if (!user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking profile:", error.message);
        return;
      }

      if (!profile) {
        const { error: insertError } = await supabase.from("profiles").upsert({
          id: user.id,
          name: user.user_metadata?.full_name || null,
          email: user.email,
        });

        if (insertError) {
          console.error("Error inserting profile:", insertError.message);
        }
      }
    };

    if (session?.user) {
      ensureProfile(session.user);
      setIsLoggedIn(true);
    }
  }, [session]);

  // Whenever input or target language changes, reset isSaved
  useEffect(() => {
    setIsSaved(false);
    setMessage("");
    setSaveMessage("");
  }, [inputText, targetLang]);

  const prefsAppliedRef = useRef(false);

  useEffect(() => {
    // Only apply prefs if loaded, session exists, and prefs.default_language exists
    if (!prefsLoading && session?.user && prefs.default_language && !prefsAppliedRef.current) {
      setTargetLang(prefs.default_language);
      if (prefs.auto_save_summaries) setAutoSave(true);
      prefsAppliedRef.current = true; // ensure this runs only once
    }
  }, [prefsLoading, session, prefs]);


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
      if (session?.user && autoSave) { // if user is logged in and has auto-save on
        await handleSaveTranslation(inputText, detectedLang, translated, targetLang);
      }

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


  async function handleSaveTranslation(
    input_text = inputText,
    input_lang = inputLang,
    output_text = translatedText,
    output_lang = targetLang
  ) {
    if (!isLoggedIn || !output_text) return;

    setSaving(true);
    setMessage("");
    setSaveMessage("");

    try {
      const token = session?.access_token;
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
          input_text,
          input_lang,
          output_text,
          output_lang,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Failed to save translation");

      setSaveMessage("Translation saved successfully");
      setIsSaved(true); // disable button after successful save
    } catch (err) {
      setSaveMessage(err.message || "Failed to save translation.");
    } finally {
      setSaving(false);
    }
  }



  return (
    <>
      <div className="page-container">
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
              onClick={() => handleSaveTranslation(inputText, inputLang, translatedText, targetLang)}
              disabled={saving || loading || isSaved}
            >
              {saving ? "Saving..." : isSaved ? "Saved" : "Save Translation"}
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