"use client";

import { useEffect, useState } from "react";
import Select from "react-select";
import { useLanguages } from "@/contexts/LanguagesContext";
import useAuthCheck from "@/hooks/useAuthCheck";

export default function MeetingPage({ role = "participant" }) {
    const { isLoggedIn, loading, session } = useAuthCheck({ redirectIfNotAuth: false, returnSession: true });
    const { languages } = useLanguages();

    // State for live data
    const [transcription, setTranscription] = useState("");
    const [translation, setTranslation] = useState("");
    const [summary, setSummary] = useState("");

    // State for languages
    const [translationLang, setTranslationLang] = useState("en");
    const [summaryLang, setSummaryLang] = useState("en");

    // Recording indicator (host only)
    const [recording, setRecording] = useState(role === "host");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true); // for react-select component
    },);

    // Example: simulate updates (replace with websocket listener)
    useEffect(() => {
        const interval = setInterval(() => {
            setTranscription(prev => prev + "\nSomeone said something new...");
            setTranslation(prev => prev + "\n[Translated line]");
            setSummary(prev => prev + "\n[Summary line]");
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    function handleEndMeeting() {
        alert("Meeting ended (TODO: call backend).");
    }

    function handleSaveSummary() {
        alert("Summary saved! (TODO: implement API call)");
    }

    function handleDownloadSummary() {
        const blob = new Blob([summary], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "meeting-summary.txt";
        link.click();
    }

    return (
        <div className="page-container">
            <h1 className="page-title">Ongoing Meeting</h1>

            <div className="ongoing-meeting-layout">
                {/* Left column */}
                <div className="ongoing-meeting-left">
                    {/* Transcription */}
                    <div className="section transcription-section">
                        <div className="section-header">
                            <span>Transcription</span>
                            {role === "host" && recording && (
                                <span className="recording-indicator">🔴 Recording</span>
                            )}
                        </div>
                        <div className="scrollable-box">
                            <pre className="section-content">
                                {transcription || "Waiting for transcription..."}
                            </pre>
                        </div>
                    </div>

                    {/* Translation */}
                    <div className="section translation-section">
                        <div className="section-header">
                            <span>Translation</span>
                            {mounted && (
                                <Select
                                    options={languages.filter((l) => l.value !== "auto")}
                                    value={languages.find((opt) => opt.value === translationLang)}
                                    onChange={(opt) => setTranslationLang(opt.value)}
                                    classNamePrefix="react-select"
                                />
                            )}
                        </div>
                        <div className="scrollable-box">
                            <pre className="section-content">
                                {translation || "Waiting for translation..."}
                            </pre>
                        </div>
                    </div>
                </div>

                {/* Right column (Summary) */}
                <div className="ongoing-meeting-right">
                    <div className="section summary-section">
                        <div className="section-header">
                            <span>Summary</span>
                            {mounted && (
                                <Select
                                    options={languages.filter((l) => l.value !== "auto")}
                                    value={languages.find((opt) => opt.value === summaryLang)}
                                    onChange={(opt) => setSummaryLang(opt.value)}
                                    classNamePrefix="react-select"
                                />
                            )}
                        </div>
                        <div className="scrollable-box">
                            <pre className="section-content">
                                {summary || "Summary will appear here..."}
                            </pre>
                        </div>

                        {/* Actions */}
                        <div className="actions-row">
                            <button
                                className="button"
                                onClick={handleSaveSummary}
                                disabled={!summary}
                            >
                                Save Summary
                            </button>
                            <button
                                className="button secondary"
                                onClick={handleDownloadSummary}
                                disabled={!summary}
                            >
                                Download
                            </button>

                        </div>
                    </div>
                </div>
            </div>
            {role === "host" && (
                <button
                    className="button danger"
                    onClick={handleEndMeeting}
                >
                    End Meeting
                </button>
            )}
        </div>
    );
}
