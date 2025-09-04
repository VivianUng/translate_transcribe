"use client";

import Select from "react-select";
import React, { useState, useRef, useEffect } from "react";

export default function ConversationPage() {
  const [listening, setListening] = useState(false);
  const [recordingType, setRecordingType] = useState(null); // "mic" or "screen"
  const [transcription, setTranscription] = useState("");
  const [translatedText, setTranslation] = useState("");
  const [targetLang, setTargetLang] = useState("en");
  const [languages, setLanguages] = useState([]);

  const micRecorderRef = useRef(null);
  const screenRecorderRef = useRef(null);
  const audioChunks = useRef([]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Load supported languages
  useEffect(() => {
    async function fetchLanguages() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/languages`);
        if (!res.ok) throw new Error("Failed to load languages");
        const data = await res.json();
        setLanguages([{ value: "auto", label: "Auto-Detect" }, ...data.map(l => ({ value: l.code, label: l.label }))]);
      } catch (err) {
        console.error("Could not load languages", err);
      }
    }
    fetchLanguages();
  }, []);

  // ---------- MIC RECORDING ----------
  const startMicRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone stream obtained", stream);

      micRecorderRef.current = new MediaRecorder(stream);
      audioChunks.current = [];

      micRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };

      micRecorderRef.current.onstart = () => {
        console.log("Mic recording started");
        setListening(true);
        setRecordingType("mic");
        setTranscription("");
      };

      micRecorderRef.current.onstop = async () => {
        console.log("Mic recording stopped");
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "mic-recording.webm");

        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/transcribe`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          console.log("Transcription result:", data);
          setTranscription(data.transcription || "No speech detected.");
        } catch (err) {
          console.error("Transcription error:", err);
        }

        setListening(false);
        setRecordingType(null);
      };

      micRecorderRef.current.start();
    } catch (err) {
      console.error("Microphone error:", err);
      alert("Unable to access microphone.");
    }
  };

  // ---------- INTERNAL AUDIO / SCREEN RECORDING ----------
  const startScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      console.log("Screen stream obtained:", stream);
      if (stream.getAudioTracks().length === 0) {
        alert("No audio track detected. Internal audio capture may not be supported on your browser.");
        console.warn("Audio tracks:", stream.getAudioTracks());
        return;
      }

      const audioStream = new MediaStream(stream.getAudioTracks()); // only audio
      screenRecorderRef.current = new MediaRecorder(audioStream);
      audioChunks.current = [];

      screenRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };

      screenRecorderRef.current.onstart = () => {
        console.log("Screen recording started");
        setListening(true);
        setRecordingType("screen");
        setTranscription("");
      };

      screenRecorderRef.current.onstop = async () => {
        console.log("Screen recording stopped");
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "screen-recording.webm");

        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/transcribe`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          console.log("Transcription result:", data);
          setTranscription(data.transcription || "No speech detected.");
        } catch (err) {
          console.error("Transcription error:", err);
        }

        setListening(false);
        setRecordingType(null);
      };

      screenRecorderRef.current.start();
    } catch (err) {
      console.error("Screen recording error:", err);
      alert("Unable to start screen recording. Make sure you allow screen/audio permissions.");
    }
  };

  // Stop current recording (mic or screen)
  const stopRecording = () => {
    console.log("Stop recording clicked");
    if (recordingType === "mic" && micRecorderRef.current) {
      micRecorderRef.current.stop();
    } else if (recordingType === "screen" && screenRecorderRef.current) {
      screenRecorderRef.current.stop();
    }
  };

  // ---------- TRANSLATION ----------
  const translateText = async () => {
    if (!transcription.trim()) return;
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcription, target_lang: targetLang }),
      });
      const data = await res.json();
      console.log("Translation result:", data);
      setTranslation(data.translated_text);
    } catch (error) {
      console.error("Translation error:", error);
    }
  };

  return (
    <div className="container">
      <h1 className="page-title">Conversation</h1>

      <div className="button-group" style={{ display: "flex", gap: "10px", marginBottom: "1rem" }}>
        <button
          onClick={recordingType === "mic" && listening ? stopRecording : startMicRecording}
          className="button conversation-button"
        >
          {recordingType === "mic" && listening ? "Stop 🎙️" : "Start 🎙️"}
        </button>

        <button
          onClick={recordingType === "screen" && listening ? stopRecording : startScreenRecording}
          className="button conversation-button"
        >
          {recordingType === "screen" && listening ? "Stop Recording 🔊" : "Capture Internal Audio 🔊"}
        </button>
      </div>

      <section className="section conversation-section">
        <h3>Transcription</h3>
        <div className="conversation-text">{transcription || "..."}</div>
      </section>

      <section className="section translation-section">
        <h3>Translation</h3>
        {mounted && (
          <Select
            options={languages.filter(opt => opt.value !== "auto")}
            value={languages.find(opt => opt.value === targetLang)}
            onChange={(opt) => setTargetLang(opt.value)}
            className="flex-1"
          />
        )}
        <div className="translation-result" tabIndex={0}>
          {translatedText || "Translation will appear here...."}
        </div>
        <button onClick={translateText} className="button translate-button">
          Translate
        </button>
      </section>
    </div>
  );
}



///////////////////////////////////////////////////////////
// For real-time converstion (not working yet)
/////////////////////////////////////////////////////////////////////////////////////////////////////////

// "use client";

// import React, { useState, useRef } from "react";

// export default function ConversationPage() {
//   const [listening, setListening] = useState(false);
//   const [transcription, setTranscription] = useState("");
//   const [translation, setTranslation] = useState("");
//   const [targetLang, setTargetLang] = useState("en");
//   const [saveConversation, setSaveConversation] = useState(false);
//   const [isLoggedIn, setIsLoggedIn] = useState(false); // simulate login

//   const ws = useRef(null);
//   const mediaRecorderRef = useRef(null);

//   // Start WebSocket and recording
//   const startListening = async () => {
//     if (ws.current) return;

//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

//       // Dynamic WebSocket URL
//       const wsUrl =
//         process.env.NODE_ENV === "development"
//           ? "ws://localhost:10000/api/ws/conversation"
//           : `wss://${window.location.host}/ws/conversation`;

//       ws.current = new WebSocket(wsUrl);

//       ws.current.onopen = () => {
//         console.log("WebSocket connected");
//         setListening(true);

//         mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
//         mediaRecorderRef.current.start(1000); // 1 second chunks

//         mediaRecorderRef.current.ondataavailable = (event) => {
//           if (event.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
//             event.data.arrayBuffer().then((buffer) => {
//               ws.current.send(buffer); // send binary audio
//             });
//           }
//         };
//       };

//       ws.current.onmessage = (event) => {
//         const data = JSON.parse(event.data);
//         if (data.transcription) {
//           setTranscription((prev) =>
//             prev ? prev + " " + data.transcription : data.transcription
//           );
//         }
//         if (data.error) {
//           console.error("Backend error:", data.error);
//         }
//       };

//       ws.current.onclose = () => {
//         console.log("WebSocket disconnected");
//         setListening(false);
//         ws.current = null;
//       };

//       ws.current.onerror = (error) => {
//         console.error("WebSocket error:", error);
//         setListening(false);
//         ws.current = null;
//       };
//     } catch (err) {
//       console.error("Microphone error:", err);
//     }
//   };

//   // Stop WebSocket and recording
//   const stopListening = () => {
//     if (mediaRecorderRef.current) {
//       mediaRecorderRef.current.stop();
//       mediaRecorderRef.current = null;
//     }
//     if (ws.current) {
//       ws.current.close();
//     }
//   };

//   // Call translation API
//   const translateText = async () => {
//     if (!transcription.trim()) return;
//     try {
//       const res = await fetch("/api/translate", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ text: transcription, target_lang: targetLang }),
//       });
//       const data = await res.json();
//       setTranslation(data.translated_text);
//     } catch (error) {
//       console.error("Translation error:", error);
//     }
//   };

//   // End conversation (optionally save)
//   const endConversation = async () => {
//     stopListening();
//     if (saveConversation && transcription.trim()) {
//       await fetch("/api/conversation/save", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           transcription,
//           translation,
//           input_language: "auto",
//           output_language: targetLang,
//         }),
//       });
//     }
//     setTranscription("");
//     setTranslation("");
//   };

//   return (
//     <div className="container">
//       <h1 className="page-title">Conversation</h1>

//       <button
//         onClick={listening ? stopListening : startListening}
//         className="button conversation-button"
//       >
//         {listening ? "Stop 🎙️" : "Start 🎙️"}
//       </button>

//       <section className="section conversation-section">
//         <h3>Transcription</h3>
//         <div className="conversation-text">{transcription || "..."}</div>
//       </section>

//       <section className="section conversation-section">
//         <h3>Translation</h3>
//         <select
//           value={targetLang}
//           onChange={(e) => setTargetLang(e.target.value)}
//           className="conversation-select"
//         >
//           <option value="en">English</option>
//           <option value="es">Spanish</option>
//           <option value="fr">French</option>
//           <option value="de">German</option>
//           <option value="zh">Chinese</option>
//         </select>
//         <div className="conversation-text">{translation || "..."}</div>
//         <button onClick={translateText} className="button conversation-button">
//           Translate
//         </button>
//       </section>

//       {isLoggedIn && (
//         <label className="conversation-save">
//           <input
//             type="checkbox"
//             checked={saveConversation}
//             onChange={() => setSaveConversation(!saveConversation)}
//           />
//           Save Conversation
//         </label>
//       )}

//       {/* <button onClick={endConversation} className="button conversation-end">
//         End
//       </button> */}
//     </div>
//   );
// }

