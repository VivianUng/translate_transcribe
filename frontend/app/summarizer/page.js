"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import LanguageSelect from "@/components/LanguageSelect";
import TextAreaCopy from "@/components/TextAreaCopy"
import useAuthCheck from "@/hooks/useAuthCheck";
import useProfilePrefs from "@/hooks/useProfilePrefs";
import { detectAndValidateLanguage } from "@/utils/languageDetection";
import { startMicRecording, stopRecording } from "@/utils/transcription";
import { summarizeText } from "@/utils/summarization";
import { generatePDF } from "@/utils/pdfGenerator";


export default function Summarizer() {
  const { isLoggedIn, load, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
  const { prefs, loading: prefsLoading } = useProfilePrefs(session, ["default_language", "auto_save_summaries",]);
  const [inputText, setInputText] = useState("");
  const [inputLang, setInputLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [summarizedText, setSummarizedText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // track if summary is saved
  const [saving, setSaving] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const [lastSummarizedInput, setLastSummarizedInput] = useState("");
  const [lastSummarizedLang, setLastSummarizedLang] = useState("");

  const micRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const [listening, setListening] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // for react-select component
  },);

  // Whenever input or target language changes, reset isSaved
  useEffect(() => {
    setIsSaved(false);
    setIsDownloaded(false);
    setMessage("");
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

  function clearDisplay() {
    setIsSaved(false);
    setIsDownloaded(false);
    setSaving(false);
    setLoading(false);
    setMessage("");
    setInputText("");
    setSummarizedText("");
  }

  async function handleMicInput() {
    clearDisplay();
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

  const handleDownload = async () => {
    try {
      const data = {
        Input: inputText,
        Summary: summarizedText,
      };

      await generatePDF(data);
      setIsDownloaded(true);
    } catch (error) {
      console.error("PDF download failed:", error);
    }
  };

  async function handleSummarize() {
    setLoading(true);
    setMessage("");
    setSummarizedText("");

    try {
      const { valid, detectedLang, filteredText, message } = await detectAndValidateLanguage(
        "summarizer",
        inputLang,
        inputText
      );
      setMessage(message);

      if (!valid) return;
      setInputText(filteredText);
      setInputLang(detectedLang);


      const summary = await summarizeText(filteredText, detectedLang, targetLang);
      setSummarizedText(summary);

      setLastSummarizedInput(filteredText);
      setLastSummarizedLang(targetLang);

      if (session?.user && autoSave) {
        await handleSaveSummary(filteredText, summary);
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

      toast.success("Summary saved Successfully");
      setIsSaved(true); // disable button after successful save
    } catch (err) {
      toast.error(err.message || "Failed to save summary.");
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
            <LanguageSelect
              mounted={mounted}
              value={inputLang}
              setValue={setInputLang}
            />
          )}
          <div
            className="mic-icon"
            title={listening ? "Stop Recording" : "Start Recording"}
            onClick={handleMicInput}
          >
            {listening ? "⏹️" : "🎙️"}
          </div>
        </div>
        <TextAreaCopy
          value={inputText}
          setValue={setInputText}
          onChangeExtra={() => setMessage("")}
          placeholder="Type text to summarize"
        />

        {/* Message displayed below the box */}
        <div className="message" role="alert" aria-live="assertive">
          {message}
        </div>
      </div>


      <section className="section summarize-section">
        <div className="section-header">
          <span>Summary</span>
          {mounted && (
            <LanguageSelect
              mounted={mounted}
              value={targetLang}
              setValue={setTargetLang}
              excludeAuto={true}
            />
          )}
          <button
            className="button sectionhead summarize-button"
            onClick={handleSummarize}
            disabled={loading || !inputText || !inputText.trim() ||
              (inputText === lastSummarizedInput && targetLang === lastSummarizedLang)}
          >
            {loading ? "Summarizing..." : "Summarize"}
          </button>
        </div>
        <TextAreaCopy
          value={summarizedText}
          setValue={() => { }}
          placeholder="Summary will appear here...."
          readOnly={true}
        />
      </section>
      <div className="button-group">
        {/* Download PDF Button */}
        <button
          className="button download-pdf-button"
          onClick={handleDownload}
          disabled={!inputText || !summarizedText || isDownloaded}
        >
          Download PDF
        </button>

        {isLoggedIn && (
          <button
            className="button save-summary-button"
            onClick={() => handleSaveSummary(inputText, summarizedText)}
            disabled={saving || loading || isSaved || !summarizedText || !inputText}
          >
            {saving ? "Saving..." : isSaved ? "Saved" : "Save Summary"}
          </button>
        )}

      </div>

    </div>
  );
}