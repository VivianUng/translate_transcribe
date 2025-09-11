"use client";

import Select from "react-select";
import { supabase } from '../../lib/supabaseClient';
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { startMicRecording, stopRecording } from "@/utils/transcription";
import { summarizeText } from "@/utils/summarization";
import { translateText } from "@/utils/translation";


export default function Summarizer() {
  const { LoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
  const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_summaries",]);
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [summarizedText, setSummarizedText] = useState("");
  const [message, setMessage] = useState("");
  const [save_message, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { languages, error } = useLanguages();
  const [autoSave, setAutoSave] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // track if summary is saved
  const [saving, setSaving] = useState(false);

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setMounted(true); // for react-select component
    if (session?.user) {
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
          inputLang,
        });
      } catch (err) {
        setMessage(err.message || "Transcription failed.");
      }
    }
  }

  async function handleSummarize() {
    setLoading(true);
    setMessage("");
    setSaveMessage("");
    setSummarizedText("");

    try {
      const { valid, detectedLang, message } = await detectAndValidateLanguage(
        inputLang,
        inputText
      );
      setMessage(message);

      if (!valid) return;

      setInputLang(detectedLang);

      let enInput = inputText;
      if (detectedLang != "en") {
        enInput = await translateText(inputText, detectedLang, "en");
      }
      const summarized = await summarizeText(enInput, targetLang);

      let finalSummary = summarized;
      if (targetLang !== "en") {
        finalSummary = await translateText(summarized, "en", targetLang);
      }
      setSummarizedText(finalSummary);

      if (session?.user && autoSave) {
        await handleSaveSummary(inputText, finalSummary);
      }


    } catch (error) {
      setMessage(error.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSummary(
    input_text = inputText,
    output_text = summarizedText
  ) {

    if (!isLoggedIn || !output_text) return;

    setSaving(true);
    setMessage("");
    setSaveMessage("");

    try {
      const token = session?.access_token;
      if (!token) {
        alert("You must be logged in to save summaries.");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "summary",
          input_text,
          output_text,
          input_lang: inputLang,
          output_lang: targetLang,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Failed to save summary");

      setSaveMessage("Summary saved Successfully");
      setIsSaved(true); // disable button after successful save
    } catch (err) {
      setSaveMessage(err.message || "Failed to save summary.");
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="page-container">
      <h1 className="page-title">Summarizer</h1>

      <div className="section summarize-section">
        <div className="section-header">
          <span>Input Text / Mic</span>
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
          placeholder="Type text to sumarize"
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


      <section className="section summarize-section">
        <div className="section-header">
          <span>Summary</span>
          {mounted && (
            <Select
              options={languages.filter(opt => opt.value !== "auto")}
              value={languages.find(opt => opt.value === targetLang)}
              onChange={(opt) => setTargetLang(opt.value)}
              className="flex-1"
            />
          )}
        </div>
        <div
          className={`summary-result ${!summarizedText ? "placeholder" : ""}`}
          tabIndex={0}
        >

          {summarizedText || "Summary will appear here...."}
        </div>
        <button
          className="button summarize-button"
          onClick={handleSummarize}
          disabled={loading || !inputText || !inputText.trim()}
        >
          {loading ? "Summarizing..." : "Summarize"}
        </button>
      </section>
      {isLoggedIn && summarizedText && (
        <div>
          <button
            className="button save-summary-button"
            onClick={() => handleSaveSummary(inputText, summarizedText)}
            disabled={saving || loading || isSaved}
          >
            {saving ? "Saving..." : isSaved ? "Saved" : "Save Summary"}
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
  );
}