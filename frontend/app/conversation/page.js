"use client";

import React, { useState, useEffect, useRef } from "react";

export default function ConversationPage() {
  const [listening, setListening] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [translation, setTranslation] = useState("");
  const [targetLang, setTargetLang] = useState("en");
  const [saveConversation, setSaveConversation] = useState(false);

  // Simulate login state (default: false)
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const ws = useRef(null);

  // Start WebSocket connection to backend to receive live transcription
  const startListening = () => {
    if (ws.current) return;
    ws.current = new WebSocket("ws://localhost:8000/ws/conversation");
    ws.current.onopen = () => {
      console.log("WebSocket connected");
      setListening(true);
    };
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.transcription) {
        setTranscription((prev) => prev + " " + data.transcription);
      }
    };
    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
      setListening(false);
      ws.current = null;
    };
    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setListening(false);
      ws.current = null;
    };
  };

  // Stop WebSocket connection
  const stopListening = () => {
    if (ws.current) {
      ws.current.close();
    }
  };

  // Call translation API
  const translateText = async () => {
    if (!transcription.trim()) return;
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcription, target_lang: targetLang }),
      });
      const data = await res.json();
      setTranslation(data.translated_text);
    } catch (error) {
      console.error("Translation error:", error);
    }
  };

  // Save conversation if checked
  const endConversation = async () => {
    stopListening();
    if (saveConversation && transcription.trim()) {
      await fetch("/api/conversation/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription,
          translation,
          input_language: "auto", // for now
          output_language: targetLang,
        }),
      });
    }
    setTranscription("");
    setTranslation("");
  };

  return (
    <div className="container">
      <h1 className="page-title">Conversation</h1>

      <button
        onClick={listening ? stopListening : startListening}
        className="button conversation-button"
      >
        {listening ? "Stop 🎙️" : "Start 🎙️"}
      </button>

      <section className="section conversation-section">
        <h3>Transcription</h3>
        <div className="conversation-text">
          {transcription || "..."}
        </div>
      </section>

      <section className="section conversation-section">
        <h3>Translation</h3>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="conversation-select"
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="zh">Chinese</option>
        </select>
        <div className="conversation-text">{translation || "..."}</div>
        <button onClick={translateText} className="button conversation-button">
          Translate
        </button>
      </section>

      {/* Only show checkbox if logged in */}
      {isLoggedIn && (
        <label className="conversation-save">
          <input
            type="checkbox"
            checked={saveConversation}
            onChange={() => setSaveConversation(!saveConversation)}
          />
          Save Conversation
        </label>
      )}

      <button onClick={endConversation} className="button conversation-end">
        End
      </button>
    </div>
  );
}