// utils/fileProcessing.js
// This module handles text extraction and transcription from different file types:
// images, documents, and audio.

import { transcribeAudio } from "./transcription";

/**
 * Extracts text from an uploaded image file using the backend OCR endpoint.
 * 
 * @param {File} file - The uploaded image file (eg., JPG, PNG).
 * @param {string} input_language - The input language (in libretranslate format).
 * @returns {Promise<string>} - The extracted text content from the image.
 * @throws {Error} - If the file is missing, extraction fails, or no text is found.
 */
export async function extractTextFromImage(file, input_language) {
  if (!file) throw new Error("No file provided");

  // Prepare the form data to send to the backend API
  const formData = new FormData();
  formData.append("input_language", input_language)
  formData.append("file", file);

  // Send the file to the backend for OCR text extraction
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/extract-image-text`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  
  // Handle server or processing errors
  if (!res.ok) {
    throw new Error(data.detail || "Failed to extract text from image");
  }

  if (!data.extracted_text) {
    throw new Error("No text extracted from image");
  }

  return data.extracted_text;
}


/**
 * Extracts text content from an uploaded document (eg., PDF, DOCX) using backend processing.
 * 
 * @param {File} file - The uploaded document file.
 * @param {string} input_language - The input language code (in libretranslate format).
 * @returns {Promise<string>} - The extracted text content from the document.
 * @throws {Error} - If the file is missing, the server returns an invalid response,
 *                   or text extraction fails.
 */
export async function extractTextFromDocument(file, input_language) {
  if (!file) throw new Error("No document provided");

  // Prepare the form data to send to the backend API
  const formData = new FormData();
  formData.append("input_language", input_language);
  formData.append("file", file);

  // Send the document for text extraction
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

  // Handle server or response errors
  if (!res.ok) {
    throw new Error(data.detail || "Failed to extract text from document");
  }

  if (!data.extracted_text) {
    throw new Error("No text extracted from document");
  }

  return data.extracted_text;
}

/**
 * Converts an uploaded audio file to WebM format for standardized processing.
 * 
 * @param {File} file - The audio file to convert.
 * @returns {Promise<File>} - A new File object in WebM format.
 */
async function convertToWebM(file) {
  // Decode the audio file into an AudioBuffer for playback and re-encoding
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Create a virtual destination to capture re-encoded audio
  const dest = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(dest);
  source.start();

  // Use MediaRecorder to capture the re-encoded stream as WebM
  const recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm" });
  const chunks = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      // Combine all recorded chunks into a single WebM file
      const webmBlob = new Blob(chunks, { type: "audio/webm" });
      resolve(new File([webmBlob], "upload_converted.webm", { type: "audio/webm" }));
    };
    recorder.onerror = reject;

    recorder.start();
    source.onended = () => recorder.stop();
  });
}


/**
 * Extracts text (transcription) from an uploaded audio file.
 * This function first converts audio to WebM format, then sends it to
 * the transcription function for speech-to-text processing.
 * 
 * @param {File} file - The audio file (eg., MP3, WAV).
 * @param {string} input_language - The spoken language code in the audio.
 * @returns {Promise<string>} - The transcribed text output.
 * @throws {Error} - If conversion or transcription fails.
 */
export async function extractTextFromAudio(file, input_language) {
  if (!file) throw new Error("No audio file provided");

  try {
    // Convert the input audio to WebM to ensure consistent backend compatibility
    const webmFile = await convertToWebM(file);
    // Perform transcription using the transcribeAudio function (calls the backend)
    const transcription = await transcribeAudio(webmFile, input_language);

    if (!transcription) {
      throw new Error("No text extracted from audio");
    }

    return transcription;
  } catch (err) {
    // Catch any unexpected errors during conversion or transcription
    throw new Error(err.message || "Failed to transcribe audio");
  }
}