//////////////////////
// using python SpeechRecognition + recognise_google (/transcribe)
// recording : one-off transcription (still used in translator and summarizer page)
//
// using WebSocket + Whisper base model transcribe (websocket.py)
// streaming : near-real-time (2s) (currently implemented in conversation page, to be added in meeting page)
//////////////////////

// utils/transcription.js

//--- Helper: convert Blob to File ---
function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type });
}


// --- API Call: Transcribe Audio ---
export async function transcribeAudio(blob, inputLang) {
  const formData = new FormData();
  formData.append("file", blobToFile(blob, "recording.webm"));
  formData.append("input_language", inputLang);

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/transcribe`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Transcription failed.");
  }
  return data.transcription;

}

// --- API Call: Transcribe Audio v2 ---
export async function transcribeAudio2(blob, language = "auto") {
  const formData = new FormData();
  formData.append("file", blobToFile(blob, "recording.webm"));
  formData.append("language", language);

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/transcribe2`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Transcription failed.");
  }

  return {
    transcription: data.transcription,
    segments: data.segments || [],
    detectedLanguage: data.detected_language || language,
  };
}


// --- MIC RECORDING LOGIC ---
export function startMicRecording({
  micRecorderRef,
  audioChunks,
  setListening,
  setRecordingType,
  onTranscription,
  onAudioReady,
  inputLang,
}) {
  return navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      micRecorderRef.current = new MediaRecorder(stream);
      audioChunks.current = [];

      micRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };

      micRecorderRef.current.onstart = () => {
        setListening(true);
        setRecordingType("mic");
        if (onTranscription) onTranscription(""); // clear transcription
      };

      micRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        if (onAudioReady) onAudioReady(audioBlob); // pass audio back
        try {
          const text = await transcribeAudio(audioBlob, inputLang);
          if (onTranscription) onTranscription(text || "No speech detected.");
        } catch (err) {
          console.error("Mic transcription error:", err);
          if (onTranscription) onTranscription("Transcription failed.");
        }
        setListening(false);
        setRecordingType(null);
      };

      micRecorderRef.current.start();
    })
    .catch((err) => {
      console.error("Microphone error:", err);
      alert("Unable to access microphone.");
    });
}

// --- SCREEN RECORDING LOGIC ---
export function startScreenRecording({
  screenStreamRef,
  screenRecorderRef,
  audioChunks,
  setListening,
  setRecordingType,
  onTranscription,
  onAudioReady,
  inputLang,
}) {
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    .then((stream) => {
      if (stream.getAudioTracks().length === 0) {
        alert("No audio track detected. Internal audio capture may not be supported.");
        return;
      }

      // Remove video track(s) so only audio remains
      stream.getVideoTracks().forEach(track => track.stop());

      screenStreamRef.current = stream;
      const audioStream = new MediaStream(stream.getAudioTracks());
      screenRecorderRef.current = new MediaRecorder(audioStream);
      audioChunks.current = [];

      screenRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };

      screenRecorderRef.current.onstart = () => {
        setListening(true);
        setRecordingType("screen");
        if (onTranscription) onTranscription(""); // clear previous transcription
      };

      screenRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        if (onAudioReady) onAudioReady(audioBlob);
        try {
          const transcription = await transcribeAudio(audioBlob, inputLang);
          if (onTranscription) onTranscription(transcription || "No speech detected.");
        } catch (err) {
          console.error("Screen transcription error:", err);
          if (onTranscription) onTranscription("Transcription failed.");
        }
        setListening(false);
        setRecordingType(null);
      };

      // --- Handle user clicking "Stop sharing" ---
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.log("User stopped screen sharing.");
          stopRecording({
            recordingType: "screen",
            screenRecorderRef,
            screenStreamRef,
            setListening,
            setRecordingType,
          });
        };
      });

      screenRecorderRef.current.start();
    })
    .catch((err) => {
      console.error("Screen recording error:", err);
      alert("Unable to start screen recording. Allow screen/audio permissions.");
    });
}

// --- STOP HELPERS ---
export function stopScreenSharing(screenStreamRef) {
  if (screenStreamRef.current) {
    screenStreamRef.current.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
  }
}

export function stopRecording({
  recordingType,
  micRecorderRef,
  screenRecorderRef,
  screenStreamRef,
  setListening,
  setRecordingType,
}) {
  if (recordingType === "mic" && micRecorderRef.current) {
    micRecorderRef.current.stop();
  } else if (recordingType === "screen") {
    if (screenRecorderRef.current) screenRecorderRef.current.stop();
    stopScreenSharing(screenStreamRef);
    setListening(false);
    setRecordingType(null);
  }
}


// --- Helper: convert Float32Array to 16-bit PCM ---
export function float32To16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// ---------------- MIC STREAMING ----------------
export async function startMicStreaming({ setTranscription, setListening, setRecordingType }) {
  const ws = new WebSocket("ws://localhost:10000/ws/transcribe");

  ws.onopen = () => console.log("WebSocket connected (mic streaming)");
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.partial_text) {
      setTranscription((prev) => {
        if (!prev.endsWith(data.partial_text)) {
          return prev + " " + data.partial_text;
        }
        return prev;
      });
    }
    if (data.error) console.error("Transcription error:", data.error);
  };
  ws.onerror = (err) => console.error("WebSocket error:", err);
  ws.onclose = () => console.log("WebSocket closed (mic streaming)");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);

  await audioContext.audioWorklet.addModule("/audio-processor.js");
  const pcmNode = new AudioWorkletNode(audioContext, "pcm-processor");

  pcmNode.port.onmessage = (event) => {
    ws.send(float32To16BitPCM(event.data));
  };

  source.connect(pcmNode);
  pcmNode.connect(audioContext.destination);

  setListening(true);
  setRecordingType("mic");

  return { ws, stream, audioContext, source, pcmNode };
}


export function stopMicStreaming({ ws, stream, audioContext, source, pcmNode, setListening, setRecordingType }) {
  if (ws) ws.close();
  if (pcmNode) pcmNode.disconnect();
  if (source) source.disconnect();
  if (audioContext) audioContext.close();
  if (stream) stream.getTracks().forEach(track => track.stop());

  setListening(false);
  setRecordingType(null);
}


// ---------------- SCREEN STREAMING ----------------
export async function startScreenStreaming({ setTranscription, setListening, setRecordingType }) {
  const ws = new WebSocket("ws://localhost:10000/ws/transcribe");

  ws.onopen = () => console.log("WebSocket connected (screen streaming)");
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.partial_text) {
      setTranscription((prev) => {
        if (!prev.endsWith(data.partial_text)) {
          return prev + " " + data.partial_text;
        }
        return prev;
      });
    }
    if (data.error) console.error("Transcription error:", data.error);
  };
  ws.onerror = (err) => console.error("WebSocket error:", err);
  ws.onclose = () => console.log("WebSocket closed (screen streaming)");

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  if (stream.getAudioTracks().length === 0) {
    alert("No audio track detected. Internal audio capture may not be supported.");
    return;
  }

  // Remove video tracks
  stream.getVideoTracks().forEach(track => track.stop());

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));

  await audioContext.audioWorklet.addModule("/audio-processor.js");
  const pcmNode = new AudioWorkletNode(audioContext, "pcm-processor");

  pcmNode.port.onmessage = (event) => {
    ws.send(float32To16BitPCM(event.data));
  };

  source.connect(pcmNode);
  pcmNode.connect(audioContext.destination);

  setListening(true);
  setRecordingType("screen");

  // Handle user clicking "Stop sharing"
  stream.getTracks().forEach(track => {
    track.onended = () => stopScreenStreaming({ ws, stream, audioContext, source, pcmNode, setListening, setRecordingType });
  });

  return { ws, stream, audioContext, source, pcmNode };
}


export function stopScreenStreaming({ ws, stream, audioContext, source, pcmNode, setListening, setRecordingType }) {
  if (ws) ws.close();
  if (pcmNode) pcmNode.disconnect();
  if (source) source.disconnect();
  if (audioContext) audioContext.close();
  if (stream) stream.getTracks().forEach(track => track.stop());

  setListening(false);
  setRecordingType(null);
}
