import { toast } from "react-hot-toast";

/**
 * Generates and downloads a PDF file with provided content.
 *
 * This function sends structured content (eg., translation, summary, meeting details)
 * to the backend endpoint `/generate-pdf`. The backend creates a PDF and returns it
 * as a binary file, which is then automatically downloaded in the browser.
 *
 * @param {Object} content - The structured content to include in the PDF.
 * @throws {Error} - If no content is provided or the backend request fails.
 */
export async function generatePDF(content) {
  // Validate that content exists and is not empty
  if (!content || Object.keys(content).length === 0) {
    throw new Error("No content provided");
  }

  // Send POST request to the backend to generate the PDF
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

  // Convert the response (binary data) into a downloadable Blob
  const blob = await res.blob();
  
  // Create a temporary URL pointing to the Blob data
  const url = window.URL.createObjectURL(blob);
  
  // Create a hidden <a> element to trigger the browser download
  const a = document.createElement("a");
  a.href = url;
  a.download = "translation_output.pdf";
  document.body.appendChild(a);
  
  // Programmatically trigger download and then clean up
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);  // free up memory

  // Display a success notification to the user
  toast.success("PDF downloaded successfully!");
}