"use client";

import Select from "react-select";
import React, { useState, useRef, useEffect } from "react";

export default function ConversationPage() {
  const [listening, setListening] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [translatedText, setTranslation] = useState("");
  const [targetLang, setTargetLang] = useState("en");
  const [languages, setLanguages] = useState([]);
  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);


  // Load supported languages
  useEffect(() => {
    async function fetchLanguages() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/languages`);
        if (!res.ok) throw new Error("Failed to load languages");
        const data = await res.json();
        setLanguages([{ value: "auto", label: "Auto-Detect" }, ...data.map(l => ({ value: l.code, label: l.label }))]);
      } catch (err) {
        setMessage("Could not load languages");
      }
    }
    fetchLanguages();
  }, []);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);

      audioChunks.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start();
      setListening(true);
      setTranscription("");
    } catch (err) {
      console.error("Microphone error:", err);
    }
  };

  // Stop recording and send audio for transcription
  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/transcribe`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        setTranscription(data.transcription || "No speech detected.");
      } catch (error) {
        console.error("Transcription error:", error);
      }
    };

    setListening(false);
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

  return (
    <div className="container">
      <h1 className="page-title">Conversation</h1>

      <button
        onClick={listening ? stopRecording : startRecording}
        className="button conversation-button"
      >
        {listening ? "Stop 🎙️" : "Start 🎙️"}
      </button>

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

