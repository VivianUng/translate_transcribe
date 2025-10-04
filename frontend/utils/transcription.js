//////////////////////
// using python SpeechRecognition + recognise_google (/transcribe)
// recording : one-off transcription (still used in translator and summarizer page)
//
// using WebSocket + Whisper base model transcribe (websocket.py)
// streaming : near-real-time (2s) (currently implemented in conversation page, to be added in meeting page)
//////////////////////

// utils/transcription.js
import { toast } from "react-hot-toast";

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
export async function startMicRecording({
  micRecorderRef,
  audioChunks,
  setListening,
  setRecordingType,
  onTranscription,
  onAudioReady,
  inputLang,
}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Check if any audio tracks exist
    if (!stream.getAudioTracks().length) {
      toast.error("No microphone detected or available.");
      stream.getTracks().forEach(track => track.stop());
      return;
    }

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
      if (onAudioReady) onAudioReady(audioBlob);

      try {
        const text = await transcribeAudio(audioBlob, inputLang);
        if (onTranscription) onTranscription(text || "No speech detected.");
      } catch (err) {
        console.warn("Mic transcription error:", err);
        if (onTranscription) onTranscription("Transcription failed.");
      }

      setListening(false);
      setRecordingType(null);

      // Stop all tracks when done
      stream.getTracks().forEach(track => track.stop());
    };

    micRecorderRef.current.start();

  } catch (err) {
    // Stop any partially obtained tracks
    if (stream) stream.getTracks().forEach(track => track.stop());

    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      toast.error("Permission required for Microphone");
    } else if (err.name === 'NotFoundError') {
      toast.error("No microphone device found");
    } else {
      console.warn("Unexpected microphone error:", err);
    }
  }
}


// --- SCREEN RECORDING LOGIC ---
export async function startScreenRecording({
  screenStreamRef,
  screenRecorderRef,
  audioChunks,
  setListening,
  setRecordingType,
  onTranscription,
  onAudioReady,
  inputLang,
}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    // Check if audio track exists
    if (stream.getAudioTracks().length === 0) {
      toast.error("No audio track detected. Internal audio capture may not be supported.");
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    // Remove video tracks so only audio remains
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
        console.warn("Screen transcription error:", err);
        if (onTranscription) onTranscription("Transcription failed.");
      }

      setListening(false);
      setRecordingType(null);

      // Stop all tracks when done
      stream.getTracks().forEach(track => track.stop());
    };

    // Handle user clicking "Stop sharing"
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

  } catch (err) {
    // Stop any partially obtained tracks
    if (stream) stream.getTracks().forEach(track => track.stop());

    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      toast.error("Permission required to share system audio.");
    } else if (err.name === 'NotFoundError') {
      toast.error("No display or audio device found.");
    } else {
      console.warn("Unexpected screen recording error:", err);
    }
  }
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

/////////////////////////////////////////////////////
// Using streaming (websocket) with Whisper 
///////////////////////////////////////////////////

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


// ---------------- COMMON AUDIO STREAMING ----------------

let recorder;
let chunks = [];
let pendingChunks = [];

/**
 * Start either mic or screen streaming
 */
export async function startAudioStreaming({
  sourceType, // 'mic' | 'screen'
  setTranscription,
  setListening,
  setRecordingType,
  inputLang,
}) {
  let stream;
  try {
    // STEP 1: get media
    if (sourceType === "screen") {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (stream.getAudioTracks().length === 0) {
        toast.error("No system audio detected. Screen capture may not support audio.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      // discard video track
      stream.getVideoTracks().forEach(t => t.stop());
    } 
    else { // mic stream
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream.getAudioTracks().length === 0) {
        toast.error("No microphone detected or available.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }
    }
  } catch (err) {
    stream?.getTracks().forEach(t => t.stop());
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      toast.error(`Permission required for ${sourceType === 'screen' ? 'screen audio' : 'microphone'}.`);
    } else if (err.name === 'NotFoundError') {
      toast.error(`No ${sourceType === 'screen' ? 'display or audio device' : 'microphone'} found.`);
    } else {
      console.warn("Unexpected media error:", err);
    }
    return;
  }

  // STEP 2: setup WebSocket
  const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/transcribe?lang=${encodeURIComponent(inputLang)}`);

  ws.onopen = () => {
    console.log(`WebSocket connected (${sourceType} streaming)`);
    while (pendingChunks.length > 0) ws.send(pendingChunks.shift());
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.partial_text) {
      setTranscription(prev => prev.endsWith(data.partial_text) ? prev : prev + " " + data.partial_text);
    }
    if (data.error) console.error("Transcription error:", data.error);
  };

  ws.onerror = (err) => console.error("WebSocket error:", err);
  ws.onclose = () => console.log(`WebSocket closed (${sourceType} streaming)`);

  // STEP 3: AudioContext + Worklet
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  await audioContext.audioWorklet.addModule("/audio-processor.js");
  const pcmNode = new AudioWorkletNode(audioContext, "pcm-processor");

  pcmNode.port.onmessage = (event) => {
    const chunk = float32To16BitPCM(event.data);
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    else pendingChunks.push(chunk);
  };

  source.connect(pcmNode);
  pcmNode.connect(audioContext.destination);

  // STEP 4: recorder setup
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  recorder.start();

  // handle stop event for screen manually (user presses "Stop sharing")
  if (sourceType === "screen") {
    stream.getTracks().forEach(track => {
      track.onended = () => stopAudioStreaming({
        ws,
        stream,
        audioContext,
        source,
        pcmNode,
        setListening,
        setRecordingType,
      });
    });
  }

  setListening(true);
  setRecordingType(sourceType);

  return { ws, stream, audioContext, source, pcmNode };
}

/**
 * Stop streaming (both mic or screen)
 */
export function stopAudioStreaming({
  ws,
  stream,
  audioContext,
  source,
  pcmNode,
  setListening,
  setRecordingType,
  onAudioReady
}) {
  console.log("Stopping audio streaming...");

  // 1. stop audio graph
  pcmNode?.disconnect();
  source?.disconnect();
  audioContext?.close();
  stream?.getTracks().forEach(track => track.stop());

  // 2. finalize recorder
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      onAudioReady?.(blob);
    };
    recorder.stop();
  }

  // 3. finalize websocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: "end" }));
    setTimeout(() => ws.close(), 500);
  }

  setListening(false);
  setRecordingType(null);
}