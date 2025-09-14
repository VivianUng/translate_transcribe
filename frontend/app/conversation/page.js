"use client";

import Select from "react-select";
import { useState, useRef, useEffect } from "react";
import { useLanguages } from "@/contexts/LanguagesContext";
import { translateText } from "@/utils/translation";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { startMicRecording, startScreenRecording, stopRecording, } from "@/utils/transcription";


export default function ConversationPage() {
  const { LoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
  const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_conversations",]);
  const [listening, setListening] = useState(false);
  const [recordingType, setRecordingType] = useState(null); // "mic" or "screen"
  const [transcription, setTranscription] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const { languages, error } = useLanguages();
  const [message, setMessage] = useState("");
  const [transcription_message, setTranscriptMessage] = useState("");
  const [autoSave, setAutoSave] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [save_message, setSaveMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false); // track if conversation is saved
  const isProcessingTranscription =
  transcription === "Converting audio to text......";


  const [loading, setLoading] = useState(false); // for translation
  const [saving, setSaving] = useState(false);   // for saving conversation

  const [segments, setSegments] = useState([]); // store diarized segments

  const micRecorderRef = useRef(null);
  const screenRecorderRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioChunks = useRef([]);

  const [mounted, setMounted] = useState(false);

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
  }, [transcription, targetLang]);

  const prefsAppliedRef = useRef(false);

  useEffect(() => {
    // Only apply prefs if loaded, session exists, and prefs.default_language exists
    if (!prefsLoading && session?.user && prefs.default_language && !prefsAppliedRef.current) {
      setTargetLang(prefs.default_language);
      if (prefs.auto_save_conversations) setAutoSave(true);
      prefsAppliedRef.current = true; // ensure this runs only once
    }
  }, [prefsLoading, session, prefs]);

  function clearDisplay() {
    setIsSaved(false);
    setSaving(false);
    setLoading(false);
    setMessage("");
    setSaveMessage("");
    setTranscription("");
    setTranscriptMessage("");
    setTranslatedText("");
  }

  // ---------- Transcription ----------
  const handleMicStart = () => {
    clearDisplay();
    startMicRecording({
      micRecorderRef,
      audioChunks,
      setListening,
      setRecordingType,
      onTranscription: setTranscription,
      setTranscription,
      inputLang,
    });
  };

  const handleScreenStart = () => {
    clearDisplay();
    startScreenRecording({
      screenStreamRef,
      screenRecorderRef,
      audioChunks,
      setListening,
      setRecordingType,
      onTranscription: setTranscription,
      setTranscription,
      inputLang,
    });
  };

  const handleStop = () => {
    stopRecording({
      recordingType,
      micRecorderRef,
      screenRecorderRef,
      screenStreamRef,
      setListening,
      setRecordingType,
    });
    // show placeholder while waiting for transcription
    setTranscription("Converting audio to text......");
  };


  // ---------- TRANSLATION ----------
  async function handleTranslate() {
    setLoading(true);
    setMessage("");
    setTranscriptMessage("");
    setTranslatedText("");

    try {
      // Step 1: Detect + validate language
      const { valid, detectedLang, message } = await detectAndValidateLanguage(
        "conversation",
        inputLang,
        transcription
      );

      setTranscriptMessage(message); // language detection feedback

      if (!valid) return;

      setInputLang(detectedLang);
      // Step 2: Translate using utils
      const translated = await translateText(transcription, detectedLang, targetLang);
      setTranslatedText(translated);

      if (session?.user && autoSave) { // if user is logged in and has auto-save on
        await handleSaveConversation(transcription, translated);
      }

    } catch (error) {
      setMessage(error.message || "Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConversation(
    input_text = transcription,
    output_text = translatedText
  ) {
    if (!isLoggedIn || !transcription) return;

    setSaving(true);
    setSaveMessage("");

    try {
      // get Supabase JWT token
      const token = session?.access_token;
      if (!token) {
        alert("You must be logged in to save conversations.");
        return;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: "conversation",
            input_text,
            output_text,
            input_lang: inputLang,
            output_lang: targetLang,
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Failed to save conversation");

      setSaveMessage("Conversation saved successfully ✅");
      setIsSaved(true); // disable button after successful save
    } catch (err) {
      setSaveMessage(err.message || "Failed to save conversation ❌");
    } finally {
      setSaving(false);
    }
  }



  return (
    <div className="page-container">
      <h1 className="page-title">Conversation</h1>

      <div className="button-group" style={{ display: "flex", gap: "10px", marginBottom: "1rem" }}>
        <button
          onClick={recordingType === "mic" && listening ? handleStop : handleMicStart}
          className="button conversation-button"
          disabled={(recordingType === "screen" && listening) || isProcessingTranscription} // disable mic if screen recording
        >
          {recordingType === "mic" && listening ? "Stop 🎙️" : "Start 🎙️"}
        </button>

        <button
          onClick={recordingType === "screen" && listening ? handleStop : handleScreenStart}
          className="button conversation-button"
          disabled={(recordingType === "mic" && listening) || isProcessingTranscription} // disable screen if mic recording
        >
          {recordingType === "screen" && listening ? "Stop Recording 🔊" : "Capture Internal Audio 🔊"}
        </button>
      </div>

      <section className="section conversation-section">
        <div className="section-header">
          <span>Transcription</span>
          {mounted && (
            <Select
              options={languages}
              value={languages.find(opt => opt.value === inputLang)}
              onChange={(opt) => setInputLang(opt.value)}
              classNamePrefix="react-select"
            />
          )}

        </div>
        <div className="conversation-text">{transcription || "..."}</div>
        <div
          className="message"
          role="alert"
          aria-live="assertive"
        >
          {transcription_message}
        </div>
      </section>

      <section className="section translation-section">
        <div className="section-header">
          <span>Translation</span>
          {mounted && (
            <Select
              options={languages.filter(opt => opt.value !== "auto")}
              value={languages.find(opt => opt.value === targetLang)}
              onChange={(opt) => setTargetLang(opt.value)}
              classNamePrefix="react-select"
            />
          )}
        </div>
        <div className="translation-result" tabIndex={0}>
          {translatedText || "Translation will appear here...."}
          {/* {Added parts} */}
          {segments.length > 0 && (
            <div className="segments">
              {segments.map((seg, i) => (
                <p key={i}>
                  <strong>{seg.speaker}:</strong> {seg.text}
                </p>
              ))}
            </div>
          )}
          {/* {Added parts} */}
        </div>
        <button
          className="button translate-button"
          onClick={handleTranslate}
          disabled={loading || !transcription || 
            !transcription.trim() || 
            isProcessingTranscription ||
            transcription === "No speech detected."}
        >
          {loading ? "Translating..." : "Translate"}
        </button>
        <div
          className="message"
          role="alert"
          aria-live="assertive"
        >
          {message}
        </div>
      </section>

      {isLoggedIn && transcription && (
        <div>
          <button
            className="button save-conversation-button"
            onClick={() => handleSaveConversation(transcription, translatedText)}
            disabled={saving || loading || isSaved ||
            transcription === "No speech detected."}
          >
            {saving ? "Saving..." : isSaved ? "Saved" : "Save Conversation"}
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

