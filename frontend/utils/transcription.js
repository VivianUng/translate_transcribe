//////////////////////
// using python SpeechRecognition + recognise_google 
// not real-time
// works
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