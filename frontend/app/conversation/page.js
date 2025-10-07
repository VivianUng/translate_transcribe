"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import LanguageSelect from "@/components/LanguageSelect"
import StickyScrollCopyBox from "@/components/StickyScrollCopyBox"
import { translateText } from "@/utils/translation";
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { generatePDF } from "@/utils/pdfGenerator";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { startAudioStreaming, stopAudioStreaming } from "@/utils/transcription";
import { useTranslateWebSocket } from "@/utils/translateWebSocket";
import { useListening } from "@/contexts/ListeningContext";



export default function ConversationPage() {
  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
  const { prefs, loading, prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_conversations",]);
  const { listening, setListening } = useListening();
  const [recordingType, setRecordingType] = useState(null); // "mic" or "screen" or "both"
  const [transcription, setTranscription] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [detectedLang, setDetectedLang] = useState("en");

  const [doTranslation, setDoTranslation] = useState(false);
  useTranslateWebSocket(inputLang, detectedLang, targetLang, transcription, doTranslation, setTranslatedText);

  const [autoSave, setAutoSave] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // track if conversation is saved
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [lastTranslatedInput, setLastTranslatedInput] = useState("");
  const [lastTranslatedLang, setLastTranslatedLang] = useState("");


  const [translating, setTranslating] = useState(false); // for translation
  const [saving, setSaving] = useState(false);   // for saving conversation

  const [audioSession, setAudioSession] = useState(null);

  const [audioURL, setAudioURL] = useState(null); // for playback

  const [mounted, setMounted] = useState(false);

  const translateDisabledReason = (() => {
    if (translating) return "Currently translating...";
    if (listening) return "Transcription in progress....";
    if (!transcription || !transcription.trim()) return "No transcription available to translate";
    if (transcription === "No speech detected.") return "No speech detected in the audio";
    if (transcription === lastTranslatedInput && targetLang === lastTranslatedLang)
      return "This transcription has already been translated to the selected language";
    if (inputLang === targetLang) return "Input language is the same as output language";
    return "";
  })();

  const translateDisabled = Boolean(translateDisabledReason);

  useEffect(() => {
    setMounted(true); // for react-select component
  },);

  // Whenever input or target language changes, reset isSaved
  useEffect(() => {
    setIsSaved(false);
    setIsDownloaded(false);
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
    setIsDownloaded(false);
    setSaving(false);
    setTranslating(false);
    setTranscription("");
    setTranslatedText("");
    setAudioURL(null);
  }


  const handleStart = async (sourceType) => {
    clearDisplay();
    const session = await startAudioStreaming({
      sourceType,
      setTranscription,
      setListening,
      setRecordingType,
      inputLang,
      setDetectedLang,
    });
    setAudioSession(session);
  };

  const handleStop = () => {
    if (!audioSession) return;

    stopAudioStreaming({
      ...audioSession,
      setListening,
      setRecordingType,
      onAudioReady: (blob) => {
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
      },
    });

    setAudioSession(null);
    setDoTranslation(false);
  };


  // ---------- TRANSLATION ----------
  async function handleTranslate() {
    setTranslating(true);
    setTranslatedText("");

    try {
      // Step 1: Detect + validate language
      const { valid, detectedLang, message } = await detectAndValidateLanguage(
        "conversation",
        inputLang,
        transcription
      );

      if (!valid) return;

      setInputLang(detectedLang);

      if (detectedLang === targetLang) {
        toast.error("Input language is same as Output Language");
        return;
      }

      // Step 2: Translate using utils
      const translated = await translateText(transcription, detectedLang, targetLang);
      setTranslatedText(translated);
      setLastTranslatedInput(transcription);
      setLastTranslatedLang(targetLang);

      if (session?.user && autoSave) { // if user is logged in and has auto-save on
        await handleSaveConversation(transcription, translated);
      }

    } catch (error) {
      toast.error(error.message || "Unexpected error occurred.");
    } finally {
      setTranslating(false);
    }
  }

  const handleDownload = async () => {
    try {
      const data = {
        Transcription: transcription,
        Translation: translatedText,
      };

      await generatePDF(data);
      setIsDownloaded(true);
    } catch (error) {
      console.error("PDF download failed:", error);
    }
  };

  async function handleSaveConversation(
    input_text = transcription,
    output_text = translatedText
  ) {
    if (!isLoggedIn || !transcription) return;

    setSaving(true);

    try {
      const token = session?.access_token;
      if (!token) {
        toast.error("You must be logged in to save conversations.");
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
          credentials: 'include',
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

      toast.success("Conversation saved successfully");
      setIsSaved(true); // disable button after successful save
    } catch (err) {
      toast.error(err.message || "Failed to save conversation");
    } finally {
      setSaving(false);
    }
  }



  return (
    <div className="page-container">
      <h1 className="page-title">Conversation</h1>

      <div className="button-group" style={{ marginTop: "-20px" }}>
        {/* Microphone only */}
        <button
          onClick={recordingType === "mic" && listening ? handleStop : () => handleStart("mic")}
          className="button audio-stream-button"
          title="Capture your microphone audio only"
          disabled={
            (recordingType === "screen" && listening) ||
            (recordingType === "both" && listening)
          }
        >
          {recordingType === "mic" && listening ? "Stop ⏹️" : "Mic 🎙️"}
        </button>

        {/* System (screen) audio only */}
        <button
          onClick={recordingType === "screen" && listening ? handleStop : () => handleStart("screen")}
          className="button audio-stream-button"
          title="Capture system or tab audio only"
          disabled={
            (recordingType === "mic" && listening) ||
            (recordingType === "both" && listening)
          }
        >
          {recordingType === "screen" && listening ? "Stop ⏹️" : "System 🔊"}
        </button>
        {/* Mic + System (both) */}
        <button
          onClick={recordingType === "both" && listening ? handleStop : () => handleStart("both")}
          className="button audio-stream-button"
          title="Capture both microphone and system sound"
          disabled={
            (recordingType === "mic" && listening) ||
            (recordingType === "screen" && listening)
          }
        >
          {recordingType === "both" && listening ? "Stop ⏹️" : "Both 🎧"}
        </button>
      </div>
      <div className="conversation-layout">
        <section className="section transcription-section">
          <div className="section-header">
            <span>Transcription</span>
            {mounted && (
              <LanguageSelect
                mounted={mounted}
                value={inputLang}
                setValue={setInputLang}
                isDisabled={listening}
              />
            )}
            {listening && (
              <span className="recording-indicator">
                🔴{" "}
                {recordingType === "mic"
                  ? "Recording microphone"
                  : recordingType === "screen"
                    ? "Recording system audio"
                    : recordingType === "both"
                      ? "Recording mic and system audio"
                      : "Recording"}
              </span>
            )}
            {/* --- Audio Playback Container --- */}
            <div className="audio-container">
              {audioURL && <audio controls src={audioURL}></audio>}
            </div>

          </div>
          <StickyScrollCopyBox
            value={transcription}
            setValue={() => { }}
            placeholder="Transcription will appear here...."
            readOnly={true}
            autoScroll={true}
          />
        </section>

        <section className="section translation-section">
          <div className="section-header">
            <span>Translation</span>
            {mounted && (
              <LanguageSelect
                mounted={mounted}
                value={targetLang}
                setValue={setTargetLang}
                excludeAuto={true}
              />
            )}
            <button
              className="button sectionhead translate-button"
              onClick={handleTranslate}
              disabled={translateDisabled}
              title={translateDisabledReason}
            >
              {translating ? "Translating..." : "Translate"}
            </button>
            <label>
              <input
                className="checkbox-input"
                type="checkbox"
                checked={doTranslation}
                onChange={(e) => setDoTranslation(e.target.checked)}
              />
              Real-Time Translate
            </label>
          </div>
          <StickyScrollCopyBox
            value={translatedText}
            setValue={() => { }}
            placeholder="Translation will appear here...."
            readOnly={true}
            autoScroll={true}
          />
        </section>

      </div>


      <div className="button-group">
        <button
          className="button download-pdf-button"
          onClick={handleDownload}
          disabled={!transcription || !translatedText || isDownloaded || listening}
        >
          Download PDF
        </button>

        {isLoggedIn && (
          <button
            className="button save-conversation-button"
            onClick={() => handleSaveConversation(transcription, translatedText)}
            disabled={saving || translating || listening || isSaved || !transcription ||
              transcription === "No speech detected."}
          >
            {saving ? "Saving..." : isSaved ? "Saved" : "Save Conversation"}
          </button>
        )}

      </div>
    </div>
  );
}

