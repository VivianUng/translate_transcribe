"use client";

import Select from "react-select";
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { translateText } from "@/utils/translation";
import { startMicRecording, stopRecording } from "@/utils/transcription";
import { extractTextFromImage, extractTextFromDocument, extractTextFromAudio } from "@/utils/fileProcessing";

export default function Translate() {
  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
  const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_translations",]);
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [fileLang, setFileLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [translatedText, setTranslatedText] = useState("");
  const [message, setMessage] = useState("");
  const [file_upload_message, setFileUploadMessage] = useState("");
  const [save_message, setSaveMessage] = useState("");
  const [translating, setTranslating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { languages, error } = useLanguages();
  const [previewFile, setPreviewFile] = useState(null);
  const [autoSave, setAutoSave] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // track if translation is saved

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const fileInputRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // for react-select component
  },);

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
      if (prefs.auto_save_translations) setAutoSave(true);
      prefsAppliedRef.current = true; // ensure this runs only once
    }
  }, [prefsLoading, session, prefs]);

  function clearDisplay() {
    setIsSaved(false);
    setSaving(false);
    setTranslating(false);
    setProcessing(false);
    setMessage("");
    setSaveMessage("");
    setInputText("");
    setTranslatedText("");
    setPreviewFile(null);
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    clearDisplay();
    setProcessing(true);
    setFileUploadMessage("Extracting...");

    // Build previewFile consistently
    let preview = {
      name: file.name,
      type: file.type,
      url: null,
      content: null,
    };

    // Handle special cases for preview
    if (file.type.startsWith("image/")) {
      preview.url = URL.createObjectURL(file);
    } else if (file.type === "text/plain") {
      preview.content = await file.text();
    } else if (file.type === "application/pdf") {
      preview.url = URL.createObjectURL(file);
    } else if (file.type.startsWith("audio/")) {
      preview.url = URL.createObjectURL(file);
    }

    setPreviewFile(preview);

    try {
      let extractedText = "";

      if (file.type.startsWith("image/")) {
        extractedText = await extractTextFromImage(file, fileLang);
        setFileUploadMessage("Text extracted from image.");
      } else if (
        file.type === "application/pdf" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "text/plain"
      ) {
        extractedText = await extractTextFromDocument(file, fileLang);
        setFileUploadMessage("Text extracted from document.");
      } else if (file.type.startsWith("audio/")) {
        extractedText = await extractTextFromAudio(file, fileLang);
        setFileUploadMessage("Text extracted from audio.");
      } else {
        setFileUploadMessage("Unsupported file type. Please upload an image, audio file, PDF, DOCX, or TXT.");
        setProcessing(false);
        return;
      }

      setInputText(extractedText);
      setTranslatedText("");
    } catch (error) {
      setFileUploadMessage(error.message);
    } finally {
      setProcessing(false);
    }
  }

  // Trigger file input
  function triggerFileInput(type = "all") {
    if (!fileInputRef.current) return;

    let acceptTypes = "";

    if (type === "image") {
      acceptTypes = "image/*";
    } else if (type === "document") {
      acceptTypes =
        "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
    } else if (type === "audio") {
      acceptTypes = "audio/*";
    } else {
      // default: allow all
      acceptTypes =
        "image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,audio/*";
    }

    fileInputRef.current.setAttribute("accept", acceptTypes);
    fileInputRef.current.click();
  }

  async function handleTranslate() {
    setTranslating(true);
    setMessage("");
    setFileUploadMessage("");
    setSaveMessage("");
    setTranslatedText("");

    try {
      const { valid, detectedLang, message } = await detectAndValidateLanguage(
        "translator",
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
      setTranslating(false);
    }
  }

  async function handleMicInput() {
    clearDisplay();
    if (listening) {
      setMessage("Processing....");
      stopRecording({
        recordingType: "mic",
        micRecorderRef,
        setListening,
        setRecordingType: () => { },
      });
    } else {
      try {
        setMessage("Recording....");
        await startMicRecording({
          micRecorderRef,
          audioChunks,
          setListening,
          setRecordingType: () => { },
          onTranscription: (text) => setInputText(text),
          setTranscription: () => { },
          inputLang,
        });
        setMessage("");
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

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "translation",
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
          {/* Text / Mic Input */}
          <div className="section">
            <div className="section-header">
              <span>Text / Mic</span>
              {mounted && (
                <Select
                  options={languages}
                  value={languages.find((opt) => opt.value === inputLang)}
                  onChange={(opt) => setInputLang(opt.value)}
                  classNamePrefix="react-select"
                />
              )}
            </div>

            {/* Textarea */}
            <textarea
              className="input-text-area"
              rows={8}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setMessage(""); // reset message whenever text changes
              }}
              placeholder="Type text to translate"
            />

            {/* Mic icon */}
            <div
              className="mic-icon"
              title={listening ? "Stop Recording" : "Start Recording"}
              onClick={handleMicInput}
            >
              {listening ? "⏹️" : "🎙️"}
            </div>

            {/* Message */}
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
                  value={languages.find((opt) => opt.value === fileLang)}
                  onChange={(opt) => setFileLang(opt.value)}
                  classNamePrefix="react-select"
                />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />

            {/* Custom upload box */}
            <div>
              <div className="upload-box" onClick={() => {
                clearDisplay();
                triggerFileInput();
              }}>
                {previewFile ? (
                  <div className="file-preview">
                    <p className="file-name"><strong>{previewFile.name}</strong></p>

                    {/* Image */}
                    {previewFile.type.startsWith("image/") && previewFile.url && (
                      <img src={previewFile.url} alt="Preview" className="file-content image" />
                    )}

                    {/* PDF */}
                    {previewFile.type === "application/pdf" && previewFile.url && (
                      <iframe src={previewFile.url} title="PDF Preview" className="file-content pdf" />
                    )}

                    {/* TXT */}
                    {previewFile.type === "text/plain" && previewFile.content && (
                      <pre className="file-content text">{previewFile.content}</pre>
                    )}

                    {/* Audio */}
                    {previewFile.type.startsWith("audio/") && previewFile.url && (
                      <audio controls src={previewFile.url} className="file-content audio">
                        Your browser does not support the audio element.
                      </audio>
                    )}

                    {/* DOCX explicitly no preview */}
                    {previewFile.type ===
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && (
                        <p className="file-content unsupported">Preview not available for DOCX files</p>
                      )}

                    {/* Fallback */}
                    {!(
                      previewFile.type.startsWith("image/") ||
                      previewFile.type === "application/pdf" ||
                      previewFile.type === "text/plain" ||
                      previewFile.type.startsWith("audio/") ||
                      previewFile.type ===
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    ) && <p className="file-content unsupported">Preview not available for this file type</p>}

                    {/* Change File Button */}
                    <button
                      className="change-file-btn"
                      onClick={(e) => {
                        e.stopPropagation(); // prevent triggering the box click
                        clearDisplay();
                        triggerFileInput();
                      }}
                    >
                      Change File
                    </button>
                  </div>
                ) : (
                  <span className="upload-text">Click to upload image, audio or document</span>
                )}
              </div>

              {/* Message displayed below the box */}
              <div
                className="message"
                role="alert"
                aria-live="assertive"
              >
                {file_upload_message}
              </div>
            </div>


          </div>
        </div>

        {/* Translate Button */}
        <button
          className="button translate-button"
          onClick={handleTranslate}
          disabled={translating || !inputText || !inputText.trim() || processing}
        >
          {translating ? "Translating..." : "Translate"}
        </button>

        {/* Translation Output */}
        <div className="section" style={{ marginTop: "1rem" }}>
          <div className="section-header">
            <span>Translation</span>
            {mounted && (
              <Select
                options={languages.filter((opt) => opt.value !== "auto")}
                value={languages.find((opt) => opt.value === targetLang)}
                onChange={(opt) => setTargetLang(opt.value)}
                classNamePrefix="react-select"
              />
            )}
          </div>
          <div
            className={`translation-result ${!translatedText ? "placeholder" : ""
              }`}
            tabIndex={0}
          >
            {translatedText || "Translation will appear here...."}
          </div>
        </div>

        {/* Save Translation (only if logged in) */}
        {isLoggedIn && translatedText && (
          <div>
            <button
              className="button save-translation-button"
              onClick={() =>
                handleSaveTranslation(
                  inputText,
                  inputLang,
                  translatedText,
                  targetLang
                )
              }
              disabled={saving || processing || isSaved}
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