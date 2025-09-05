////////////////////////////////////////////////
// for one-off transcriptions
///////////////////////////////////////////////

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
  const screenStreamRef = useRef(null);
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

      screenStreamRef.current = stream;
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

  // Stop screen sharing
  const stopScreenSharing = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      console.log("Screen sharing stopped");
    }
  };

  // Stop current recording
  const stopRecording = () => {
    console.log("Stop recording clicked");
    if (recordingType === "mic" && micRecorderRef.current) {
      micRecorderRef.current.stop();
    } else if (recordingType === "screen") {
      if (screenRecorderRef.current) screenRecorderRef.current.stop();
      stopScreenSharing(); // <-- stop screen sharing even if recorder is null
      setListening(false);
      setRecordingType(null);
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
        <p className="section-header">Transcription</p>
        <div className="conversation-text">{transcription || "..."}</div>
      </section>

      <section className="section translation-section">
        <div className="section-header">
            <span>Translation</span>
            {mounted && (
              <Select
              options={languages.filter(opt => opt.value !== "auto")}
              value={languages.find(opt => opt.value === targetLang)}
              onChange={(opt) => setTargetLang(opt.value)}
              className="flex-1"
            />
            )}
          </div>
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
// For real-time converstion (problem with some words not detected (chunk size))
// temp : debugging statements appending the [empty] output in the transcription field for empty chunks
/////////////////////////////////////////////////////////////////////////////////////////////////////////
// "use client";

// import Select from "react-select";
// import React, { useState, useRef, useEffect } from "react";

// export default function ConversationPage() {
//   const [listening, setListening] = useState(false);
//   const [recordingType, setRecordingType] = useState(null); // "mic" or "screen"
//   const [transcription, setTranscription] = useState("");
//   const [translatedText, setTranslation] = useState("");
//   const [targetLang, setTargetLang] = useState("en");
//   const [languages, setLanguages] = useState([]);

//   const chunkSize = 3000; // 3 sec chunks for transcription
//   const micRecorderRef = useRef(null);
//   const screenRecorderRef = useRef(null);
//   const screenStreamRef = useRef(null);
//   const audioBuffer = useRef([]); // holds chunks including overlap

//   const [mounted, setMounted] = useState(false);

//   useEffect(() => setMounted(true), []);

//   // Load supported languages
//   useEffect(() => {
//     async function fetchLanguages() {
//       try {
//         const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/languages`);
//         if (!res.ok) throw new Error("Failed to load languages");
//         const data = await res.json();
//         setLanguages([{ value: "auto", label: "Auto-Detect" }, ...data.map(l => ({ value: l.code, label: l.label }))]);
//       } catch (err) {
//         console.error("Could not load languages", err);
//       }
//     }
//     fetchLanguages();
//   }, []);

//   // ---------- MIC RECORDING ----------
//   const startMicRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       console.log("Microphone stream obtained", stream);

//       audioBuffer.current = [];
//       setTranscription("");

//       micRecorderRef.current = new MediaRecorder(stream);
//       micRecorderRef.current.ondataavailable = handleChunk;
//       micRecorderRef.current.onstart = () => {
//         console.log("Mic recording started");
//         setListening(true);
//         setRecordingType("mic");
//       };
//       micRecorderRef.current.onstop = () => {
//         console.log("Mic recording stopped");
//         setListening(false);
//         setRecordingType(null);
//       };

//       micRecorderRef.current.start(chunkSize);
//     } catch (err) {
//       console.error("Microphone error:", err);
//       alert("Unable to access microphone.");
//     }
//   };

//   // ---------- INTERNAL AUDIO / SCREEN RECORDING ----------
//   const startScreenRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
//       console.log("Screen stream obtained:", stream);

//       if (stream.getAudioTracks().length === 0) {
//         alert("No audio track detected. Internal audio capture may not be supported on your browser.");
//         console.warn("Audio tracks:", stream.getAudioTracks());
//         return;
//       }

//       screenStreamRef.current = stream;
//       audioBuffer.current = [];
//       setTranscription("");

//       const audioStream = new MediaStream(stream.getAudioTracks());
//       screenRecorderRef.current = new MediaRecorder(audioStream);
//       screenRecorderRef.current.ondataavailable = handleChunk;
//       screenRecorderRef.current.onstart = () => {
//         console.log("Screen recording started");
//         setListening(true);
//         setRecordingType("screen");
//       };
//       screenRecorderRef.current.onstop = () => {
//         console.log("Screen recording stopped");
//         screenRecorderRef.current = null;
//         stopScreenSharing();
//         setListening(false);
//         setRecordingType(null);
//       };

//       screenRecorderRef.current.start(chunkSize);
//     } catch (err) {
//       console.error("Screen recording error:", err);
//       alert("Unable to start screen recording. Make sure you allow screen/audio permissions.");
//     }
//   };

//   // Handle each chunk
//   const handleChunk = async (event) => {
//     if (event.data.size === 0) return;

//     // Append new chunk to buffer with small overlap
//     audioBuffer.current.push(event.data);

//     // Combine last two chunks for overlap handling
//     const bufferToSend = new Blob(audioBuffer.current.slice(-2), { type: "audio/webm" });

//     const formData = new FormData();
//     formData.append("file", bufferToSend, "chunk-overlap.webm");

//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/transcribe`, {
//         method: "POST",
//         body: formData,
//       });
//       const data = await res.json();
//       console.log("Chunk transcription:", data);

//       const text = data.transcription?.trim() || "[empty chunk]";
//       setTranscription(prev => prev + " " + text);
//     } catch (err) {
//       console.error("Chunk transcription error:", err);
//       setTranscription(prev => prev + " [error]");
//     }
//   };

//   // Stop screen sharing
//   const stopScreenSharing = () => {
//     if (screenStreamRef.current) {
//       screenStreamRef.current.getTracks().forEach(track => track.stop());
//       screenStreamRef.current = null;
//       console.log("Screen sharing stopped");
//     }
//   };

//   // Stop current recording
//   const stopRecording = () => {
//     console.log("Stop recording clicked");
//     if (recordingType === "mic" && micRecorderRef.current) {
//       micRecorderRef.current.stop();
//     } else if (recordingType === "screen") {
//       if (screenRecorderRef.current) screenRecorderRef.current.stop();
//       stopScreenSharing();
//       setListening(false);
//       setRecordingType(null);
//     }
//   };

//   // ---------- TRANSLATION ----------
//   const translateText = async () => {
//     if (!transcription.trim()) return;
//     try {
//       const res = await fetch("/api/translate", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ text: transcription, target_lang: targetLang }),
//       });
//       const data = await res.json();
//       console.log("Translation result:", data);
//       setTranslation(data.translated_text);
//     } catch (error) {
//       console.error("Translation error:", error);
//     }
//   };

//   return (
//     <div className="container">
//       <h1 className="page-title">Conversation</h1>

//       <div className="button-group" style={{ display: "flex", gap: "10px", marginBottom: "1rem" }}>
//         <button onClick={recordingType === "mic" && listening ? stopRecording : startMicRecording} className="button conversation-button">
//           {recordingType === "mic" && listening ? "Stop 🎙️" : "Start 🎙️"}
//         </button>

//         <button onClick={recordingType === "screen" && listening ? stopRecording : startScreenRecording} className="button conversation-button">
//           {recordingType === "screen" && listening ? "Stop Recording 🔊" : "Capture Internal Audio 🔊"}
//         </button>
//       </div>

//       <section className="section conversation-section">
//         <h3>Transcription</h3>
//         <div className="conversation-text">{transcription || "Waiting for audio..."}</div>
//       </section>

//       <section className="section translation-section">
//         <h3>Translation</h3>
//         {mounted && (
//           <Select
//             options={languages.filter(opt => opt.value !== "auto")}
//             value={languages.find(opt => opt.value === targetLang)}
//             onChange={(opt) => setTargetLang(opt.value)}
//             className="flex-1"
//           />
//         )}
//         <div className="translation-result" tabIndex={0}>
//           {translatedText || "Translation will appear here...."}
//         </div>
//         <button onClick={translateText} className="button translate-button">
//           Translate
//         </button>
//       </section>
//     </div>
//   );
// }
