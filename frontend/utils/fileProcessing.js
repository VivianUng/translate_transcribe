// utils/fileProcessing.js
import { transcribeAudio } from "./transcription";

export async function extractTextFromImage(file, input_language) {
  if (!file) throw new Error("No file provided");

  const formData = new FormData();
  formData.append("input_language", input_language)
  formData.append("file", file);

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/extract-image-text`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Failed to extract text from image");
  }

  if (!data.extracted_text) {
    throw new Error("No text extracted from image");
  }

  return data.extracted_text;
}


export async function extractTextFromDocument(file, input_language) {
  if (!file) throw new Error("No document provided");

  const formData = new FormData();
  formData.append("input_language", input_language);
  formData.append("file", file);

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/extract-doc-text`, {
    method: "POST",
    body: formData,
  });

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error("Invalid response from server");
  }

  if (!res.ok) {
    throw new Error(data.detail || "Failed to extract text from document");
  }

  if (!data.extracted_text) {
    throw new Error("No text extracted from document");
  }

  return data.extracted_text;
}

async function convertToWebM(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const dest = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(dest);
  source.start();

  const recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm" });
  const chunks = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const webmBlob = new Blob(chunks, { type: "audio/webm" });
      resolve(new File([webmBlob], "upload_converted.webm", { type: "audio/webm" }));
    };
    recorder.onerror = reject;

    recorder.start();
    source.onended = () => recorder.stop();
  });
}


export async function extractTextFromAudio(file, input_language) {
  if (!file) throw new Error("No audio file provided");

  try {
    const webmFile = await convertToWebM(file);
    const transcription = await transcribeAudio(webmFile, input_language);

    if (!transcription) {
      throw new Error("No text extracted from audio");
    }

    return transcription;
  } catch (err) {
    throw new Error(err.message || "Failed to transcribe audio");
  }
}