// utils/transcription.js

/**
 * @file Transcription Utilities
 * @description
 * This module provides transcription utilities for:
 *  - One-off transcription (using Python backend API)
 *  - Real-time transcription via WebSocket (Whisper model)
 *
 * Modes:
 * - Recording Mode (Translator/Summarizer pages): Uses `/transcribe` REST API
 * - Streaming Mode (Conversation/Meeting pages): Uses WebSocket for continuous transcription
 */

import { toast } from "react-hot-toast";

/**
 * Converts a Blob into a File object for backend upload.
 *
 * @param {Blob} blob - The audio data blob.
 * @param {string} filename - The name of the resulting file.
 * @returns {File} - A new File object based on the blob.
 */
function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type });
}


/**
 * Sends a single audio file to the backend for transcription.
 *
 * @async
 * @function transcribeAudio
 * @param {Blob} blob - The recorded audio blob to transcribe.
 * @param {string} inputLang - The language code (in libretranslate format).
 * @returns {Promise<string>} The transcribed text.
 * @throws {Error} If the transcription API fails or returns an error.
 */
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



//  MIC RECORDING LOGIC 
/**
 * Starts microphone recording and sends the audio for transcription when stopped.
 *
 * @async
 * @function startMicRecording
 * @param {Object} params - Configuration parameters.
 * @param {React.RefObject<MediaRecorder|null>} params.micRecorderRef - Ref for the MediaRecorder instance.
 * @param {React.RefObject<Blob[]>} params.audioChunks - Ref to store recorded audio chunks.
 * @param {Function} params.setListening - React state setter for listening state.
 * @param {Function} params.setRecordingType - React state setter for recording type.
 * @param {Function} [params.onTranscription] - Callback to handle transcribed text.
 * @param {Function} [params.onAudioReady] - Callback triggered when audio is ready.
 * @param {string} params.inputLang - Input language code.
 * @returns {Promise<void>}
 */
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
    // Request microphone access
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Check if any audio tracks exist
    if (!stream.getAudioTracks().length) {
      toast.error("No microphone detected or available.");
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    micRecorderRef.current = new MediaRecorder(stream);
    audioChunks.current = [];

    // Collect audio data chunks
    micRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.current.push(event.data);
    };

    // Recording started
    micRecorderRef.current.onstart = () => {
      setListening(true);
      setRecordingType("mic");
      if (onTranscription) onTranscription(""); // clear transcription
    };

    // Recording stopped --> send for transcription
    micRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
      if (onAudioReady) onAudioReady(audioBlob);

      try {
        const text = await transcribeAudio(audioBlob, inputLang);
        if (onTranscription) onTranscription(text || "No speech detected.");
      } catch (err) {
        toast.error("Mic transcription error:", err);
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

    // Handle permission or hardware errors
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      toast.error(`Permission required for Microphone ${err.name}`);
    } else if (err.name === 'NotFoundError') {
      toast.error("No microphone device found");
    } else {
      toast.error("Unexpected microphone error:", err.name);
    }
  }
}


//  SCREEN RECORDING LOGIC 
/**
 * Starts recording system audio from screen sharing and transcribes it after stop.
 *
 * @async
 * @function startScreenRecording
 * @param {Object} params - Configuration parameters.
 * @param {React.RefObject<MediaStream|null>} params.screenStreamRef - Ref for screen stream.
 * @param {React.RefObject<MediaRecorder|null>} params.screenRecorderRef - Ref for recorder.
 * @param {React.RefObject<Blob[]>} params.audioChunks - Ref for audio chunks.
 * @param {Function} params.setListening - React state setter for listening state.
 * @param {Function} params.setRecordingType - React state setter for recording type.
 * @param {Function} [params.onTranscription] - Callback for transcription results.
 * @param {Function} [params.onAudioReady] - Callback when audio is ready.
 * @param {string} params.inputLang - Input language code.
 * @returns {Promise<void>}
 */
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
    // Request screen (with audio) access
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

    // Collect audio chunks
    screenRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.current.push(event.data);
    };

    screenRecorderRef.current.onstart = () => {
      setListening(true);
      setRecordingType("screen");
      if (onTranscription) onTranscription(""); // clear previous transcription
    };

    // Stop recording and transcribe
    screenRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
      if (onAudioReady) onAudioReady(audioBlob);

      try {
        const transcription = await transcribeAudio(audioBlob, inputLang);
        if (onTranscription) onTranscription(transcription || "No speech detected.");
      } catch (err) {
        toast.error("Screen transcription error:", err);
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
    // Handle permission and hardware errors
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      toast.error("Permission required to share system audio.");
    } else if (err.name === 'NotFoundError') {
      toast.error("No display or audio device found.");
    } else {
      toast.error("Unexpected screen recording error:", err);
    }
  }
}


//  STOP HELPERS 
/**
 * Stops screen sharing stream.
 *
 * @function stopScreenSharing
 * @param {React.RefObject<MediaStream|null>} screenStreamRef - Ref to the active screen stream.
 */
export function stopScreenSharing(screenStreamRef) {
  if (screenStreamRef.current) {
    screenStreamRef.current.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
  }
}

/**
 * Stops any ongoing recording (mic or screen).
 *
 * @function stopRecording
 * @param {Object} params - Recording context parameters.
 * @param {"mic"|"screen"} params.recordingType - The current recording mode.
 * @param {React.RefObject<MediaRecorder|null>} params.micRecorderRef - Mic recorder reference.
 * @param {React.RefObject<MediaRecorder|null>} params.screenRecorderRef - Screen recorder reference.
 * @param {React.RefObject<MediaStream|null>} params.screenStreamRef - Screen stream reference.
 * @param {Function} params.setListening - State setter for listening.
 * @param {Function} params.setRecordingType - State setter for recording type.
 */
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

/**
 * Converts a Float32Array of audio data into a 16-bit PCM ArrayBuffer.
 * Required for sending raw audio chunks to backend via WebSocket
 *
 * @function float32To16BitPCM
 * @param {Float32Array} float32Array - The input audio data.
 * @returns {ArrayBuffer} - PCM-encoded audio buffer.
 */
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


//  COMMON AUDIO STREAMING 

let recorder;
let chunks = [];
let pendingChunks = [];

/**
 * Starts real-time audio streaming to the backend via WebSocket.
 *
 * @function startAudioStreaming
 * @param {Object} params - Configuration options.
 * @param {"mic"|"screen"|"both"} params.sourceType - Type of audio source to capture.
 * @param {Function} params.setTranscription - State setter for updating transcription text in UI.
 * @param {Function} params.setListening - State setter to mark listening/recording state.
 * @param {Function} params.setRecordingType - State setter to indicate recording source type.
 * @param {string} params.inputLang - Input language code (or `"auto"` for language auto-detection).
 * @param {Function} params.setDetectedLang - Callback to update detected language dynamically.
 * @returns {Promise<Object|undefined>} Returns an object containing WebSocket and audio context references, or `undefined` on error.
 *
 * @throws {DOMException} When user denies microphone/screen access or no audio device is available.
 */
export async function startAudioStreaming({
  sourceType, // 'mic' | 'screen' | 'both'
  setTranscription,
  setListening,
  setRecordingType,
  inputLang,
  setDetectedLang,
}) {
  let stream;
  let micStream, screenStream;
  try {
    // STEP 1: get media
    if (sourceType === "screen") {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (screenStream.getAudioTracks().length === 0) {
        toast.error("No system audio detected. Screen capture may not support audio.");
        screenStream.getTracks().forEach(t => t.stop());
        return;
      }
      // discard video track
      screenStream.getVideoTracks().forEach(t => t.stop());
      stream = screenStream;
    }
    else if (sourceType === "mic") { // mic stream
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (micStream.getAudioTracks().length === 0) {
        toast.error("No microphone detected or available.");
        micStream.getTracks().forEach(t => t.stop());
        return;
      }
      stream = micStream;
    }
    else if (sourceType === "both") {
      // Mic
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (micStream.getAudioTracks().length === 0) {
        toast.error("No microphone detected or available.");
        micStream.getTracks().forEach(t => t.stop());
        return;
      }

      // System audio (screen)
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (screenStream.getAudioTracks().length === 0) {
        toast.error("No system audio detected. Screen capture may not support audio.");
        screenStream.getTracks().forEach(t => t.stop());
        return;
      }
      screenStream.getVideoTracks().forEach(t => t.stop());

      // Combine both
      const audioContext = new AudioContext();
      const micSource = audioContext.createMediaStreamSource(micStream);
      const sysSource = audioContext.createMediaStreamSource(screenStream);
      const destination = audioContext.createMediaStreamDestination();

      // adjust volume levels
      const micGain = audioContext.createGain();
      const sysGain = audioContext.createGain();
      micGain.gain.value = 1.0;
      sysGain.gain.value = 1.0;

      micSource.connect(micGain).connect(destination);
      sysSource.connect(sysGain).connect(destination);

      // merged stream (only contains mixed audio)
      stream = destination.stream;

      // store for later cleanup
      stream._extraStreams = [micStream, screenStream, audioContext];
    }
  } catch (err) {
    stream?.getTracks().forEach(t => t.stop());
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      toast.error(`Permission required for ${sourceType} audio ${err.name}.`);
    } else if (err.name === 'NotFoundError') {
      toast.error(`No ${sourceType === 'screen' ? 'display or audio device' : 'microphone'} found.`);
    } else {
      toast.error(`Unexpected media error: ${err}`);
    }
    return;
  }

  // STEP 2: setup WebSocket
  const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WEBSOCKET_URL}/transcribe?lang=${encodeURIComponent(inputLang)}`);

  ws.onopen = () => {
    console.log(`WebSocket connected (${sourceType} streaming)`);
    while (pendingChunks.length > 0) ws.send(pendingChunks.shift());
  };


  // Buffers for transcription
  let finalText = "";        // Holds finalized retranscribed text
  let pendingChunks = [];    // Holds live incremental chunks before retranscription

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.partial_text) {
        if (data.is_retranscribe) {
          // Replace pending section with retranscribed content
          finalText = (finalText + " " + data.partial_text).trim();

          // Clear pending live chunks (was already retranscribed)
          pendingChunks = [];
        } else {
          // Append new small chunk
          pendingChunks.push(data.partial_text);
        }

        // Build full transcription for display
        const combined =
          finalText +
          (pendingChunks.length ? " " + pendingChunks.join(" ") : "");

        setTranscription(combined);
      }

      // Auto-detect language
      if (data.detected_lang && inputLang === "auto") {
        setDetectedLang((prev) =>
          prev !== data.detected_lang ? data.detected_lang : prev
        );
      }

      if (data.error) console.error("Transcription error:", data.error);
      if (data.event === "done") console.log("Transcription complete");
    } catch (err) {
      console.warn("Malformed WebSocket message:", err);
    }
  };


  ws.onerror = (err) => console.error("WebSocket error:", err);
  ws.onclose = () => console.log(`WebSocket closed (${sourceType} streaming)`);

  // STEP 3: AudioContext + Worklet
  // Process audio into 16-bit PCM chunks and send to WebSocket
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

  // STEP 4: recorder setup (for playback)
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  recorder.start();

  // handle stop event for screen manually (user presses "Stop sharing")
  if (sourceType === "screen" || sourceType === "both") {
    const handleStop = () => stopAudioStreaming({
      ws, stream, audioContext, source, pcmNode, setListening, setRecordingType,
    });
    screenStream?.getTracks().forEach(track => (track.onended = handleStop));
  }

  setListening(true);
  setRecordingType(sourceType);

  return { ws, stream, audioContext, source, pcmNode };
}


/**
 * Gracefully stops active audio streaming, closes connections, and finalizes recorded data.
 *
 * @function stopAudioStreaming
 * @param {Object} params - Cleanup parameters.
 * @param {WebSocket} params.ws - Active WebSocket connection.
 * @param {MediaStream} params.stream - Active audio media stream.
 * @param {AudioContext} params.audioContext - The active AudioContext.
 * @param {MediaStreamAudioSourceNode} params.source - The source node connected to the AudioContext.
 * @param {AudioWorkletNode} params.pcmNode - PCM processor node for encoding.
 * @param {Function} params.setListening - State setter for listening state.
 * @param {Function} params.setRecordingType - State setter for recording type.
 * @param {Function} [params.onAudioReady] - Optional callback invoked with final audio Blob.
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

  // If combined stream had extra references, stop those too
  if (stream?._extraStreams) {
    for (const s of stream._extraStreams) {
      if (s instanceof MediaStream) s.getTracks().forEach(t => t.stop());
      if (s instanceof AudioContext) s.close();
    }
  }

  // 2. finalize recorder
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      onAudioReady?.(blob);
    };
    recorder.stop();
  }

  setListening(false);
  setRecordingType(null);

  // 3. Send "end" event to server and wait for "done"
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: "end" }));

    // Listen for server's "done" message
    const handleMessage = (msgEvent) => {
      const data = JSON.parse(msgEvent.data);
      if (data.event === "done") {
        console.log("All transcription received. Closing WebSocket.");
        ws.removeEventListener("message", handleMessage);
        ws.close();
      }
    };

    ws.addEventListener("message", handleMessage);

    // fallback timeout if server never responds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.warn("Server did not send 'done', forcing WebSocket close.");
        ws.removeEventListener("message", handleMessage);
        ws.close();
      }
    }, 10000); // 10 seconds fallback
  }
}