// utils/fileProcessing.js

export async function extractTextFromImage(file) {
  if (!file) throw new Error("No file provided");

  const formData = new FormData();
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
