
//////////////////////
// using python SpeechRecognition + rexognise_google 
// not real-time
// works
//////////////////////

// utils/transcription.js

//--- Helper: convert Blob to File ---
function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type });
}

// --- API Call: Transcribe Audio ---
export async function transcribeAudio(blob, language = "en-US") {
  const formData = new FormData();
  formData.append("file", blobToFile(blob, "recording.webm"));
  formData.append("language", language);

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

// --- MIC RECORDING LOGIC ---
export function startMicRecording({
  micRecorderRef,
  audioChunks,
  setListening,
  setRecordingType,
  onTranscription,
  setTranscription,
  language = "en-US",
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
        if (setTranscription) setTranscription("");
      };

      micRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        try {
          const transcription = await transcribeAudio(audioBlob, language);
          onTranscription(transcription || "No speech detected.");
        } catch (err) {
          console.error("Mic transcription error:", err);
          onTranscription("Transcription failed.");
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
  setTranscription,
  language = "en-US",
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
        if (setTranscription) setTranscription("");
      };

      screenRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        try {
          const transcription = await transcribeAudio(audioBlob, language);
          onTranscription(transcription || "No speech detected.");
        } catch (err) {
          console.error("Screen transcription error:", err);
          onTranscription("Transcription failed.");
        }
        setListening(false);
        setRecordingType(null);
      };

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