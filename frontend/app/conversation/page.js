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
    <div className="conversation-container">
      <h1 className="conversation-title">Conversation</h1>

      <button
        onClick={listening ? stopListening : startListening}
        className="conversation-button"
      >
        {listening ? "Stop 🎙️" : "Start 🎙️"}
      </button>

      <section className="conversation-section">
        <h3>Transcription</h3>
        <div className="conversation-text">
          {transcription || "..."}
        </div>
      </section>

      <section className="conversation-section">
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
        <button onClick={translateText} className="conversation-button">
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

      <button onClick={endConversation} className="conversation-end">
        End
      </button>
    </div>
  );
}



// "use client";

// import React, { useState, useEffect, useRef } from "react";

// export default function ConversationPage() {
//   const [listening, setListening] = useState(false);
//   const [transcription, setTranscription] = useState("");
//   const [translation, setTranslation] = useState("");
//   const [targetLang, setTargetLang] = useState("en");
//   const [saveConversation, setSaveConversation] = useState(false);
//   const ws = useRef(null);

//   // Start WebSocket connection to backend to receive live transcription
//   const startListening = () => {
//     if (ws.current) return;
//     ws.current = new WebSocket("ws://localhost:8000/ws/conversation");
//     ws.current.onopen = () => {
//       console.log("WebSocket connected");
//       setListening(true);
//     };
//     ws.current.onmessage = (event) => {
//       const data = JSON.parse(event.data);
//       if (data.transcription) {
//         setTranscription((prev) => prev + " " + data.transcription);
//       }
//     };
//     ws.current.onclose = () => {
//       console.log("WebSocket disconnected");
//       setListening(false);
//       ws.current = null;
//     };
//     ws.current.onerror = (error) => {
//       console.error("WebSocket error:", error);
//       setListening(false);
//       ws.current = null;
//     };
//   };

//   // Stop WebSocket connection
//   const stopListening = () => {
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

//   // Save conversation if checked
//   const endConversation = async () => {
//     stopListening();
//     if (saveConversation && transcription.trim()) {
//       await fetch("/api/conversation/save", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           transcription,
//           translation,
//           input_language: "auto", // for now
//           output_language: targetLang,
//         }),
//       });
//     }
//     setTranscription("");
//     setTranslation("");
//   };

//   return (
//     <div style={{ maxWidth: 800, margin: "auto", padding: 20, fontFamily: "Arial" }}>
//       <h1>Conversation</h1>
//       <button
//         onClick={listening ? stopListening : startListening}
//         style={{
//           backgroundColor: "#6c63ff",
//           color: "white",
//           borderRadius: 20,
//           padding: "10px 20px",
//           border: "none",
//           cursor: "pointer",
//           fontWeight: "bold",
//           marginBottom: 20,
//         }}
//       >
//         {listening ? "Stop 🎙️" : "Start 🎙️"}
//       </button>

//       <section style={{ backgroundColor: "#e6e0f8", borderRadius: 10, padding: 15, marginBottom: 20 }}>
//         <h3>Transcription</h3>
//         <div style={{ whiteSpace: "pre-wrap", minHeight: 100 }}>{transcription || "..."}</div>
//       </section>

//       <section style={{ backgroundColor: "#e6e0f8", borderRadius: 10, padding: 15, marginBottom: 20 }}>
//         <h3>Translation</h3>
//         <select
//           value={targetLang}
//           onChange={(e) => setTargetLang(e.target.value)}
//           style={{ marginBottom: 10, padding: 5 }}
//         >
//           <option value="en">English</option>
//           <option value="es">Spanish</option>
//           <option value="fr">French</option>
//           <option value="de">German</option>
//           <option value="zh">Chinese</option>
//           {/* Add more languages as needed */}
//         </select>
//         <div style={{ whiteSpace: "pre-wrap", minHeight: 100, marginBottom: 10 }}>{translation || "..."}</div>
//         <button
//           onClick={translateText}
//           style={{
//             backgroundColor: "#6c63ff",
//             color: "white",
//             borderRadius: 20,
//             padding: "8px 16px",
//             border: "none",
//             cursor: "pointer",
//             fontWeight: "bold",
//           }}
//         >
//           Translate
//         </button>
//       </section>

//       <label style={{ display: "block", marginBottom: 20 }}>
//         <input
//           type="checkbox"
//           checked={saveConversation}
//           onChange={() => setSaveConversation(!saveConversation)}
//           style={{ marginRight: 8 }}
//         />
//         Save Conversation
//       </label>

//       <button
//         onClick={endConversation}
//         style={{
//           backgroundColor: "#6c63ff",
//           color: "white",
//           borderRadius: 20,
//           padding: "10px 20px",
//           border: "none",
//           cursor: "pointer",
//           fontWeight: "bold",
//           float: "right",
//         }}
//       >
//         End
//       </button>
//     </div>
//   );
// }