export async function generatePDF(content) {
  if (!content || Object.keys(content).length === 0) {
    throw new Error("No content provided");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/generate-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to generate PDF");
  }

  // --- Convert response into a downloadable file ---
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "generated_output.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}