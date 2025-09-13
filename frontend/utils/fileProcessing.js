// utils/fileProcessing.js

export async function extractTextFromImage(file, input_language) {
  if (!file) throw new Error("No file provided");

  const formData = new FormData();
  formData.append("input_language", input_language)
  formData.append("file", file);

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/extract-text`, {
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
