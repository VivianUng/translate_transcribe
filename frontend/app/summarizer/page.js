"use client";

import Select from "react-select";
import { supabase } from '../../lib/supabaseClient';
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { startMicRecording, stopRecording } from "@/utils/transcription";
import { summarizeText } from "@/utils/summarization";


export default function Summarizer() {

  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [summarizedText, setSummarizedText] = useState("");
  const [message, setMessage] = useState("");
  const [save_message, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { languages, error } = useLanguages();

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

      const summarized = await summarizeText(inputText, targetLang);
      setSummarizedText(summarized);

    } catch (error) {
      setMessage(error.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSummary() {
    if (!isLoggedIn || !summarizedText) return;

    setLoading(true);
    setMessage("");
    setSaveMessage("")

    try {
      // get Supabase JWT token from localstorage
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      if (!token) {
        alert("You must be logged in to save summaries.");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/save-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          input_text: inputText,
          output_text: summarizedText,
        }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.detail || "Failed to save summary");

      setSaveMessage("Summary saved Successfully");
    } catch (err) {
      setSaveMessage(err.message || "Failed to save summary.");
    } finally {
      setLoading(false);
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
            onClick={handleSaveSummary}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Summary"}
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