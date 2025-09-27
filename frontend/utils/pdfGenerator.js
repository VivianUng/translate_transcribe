export async function generatePDF(content, input_language = "en", output_language = "en") {
  if (!content || Object.keys(content).length === 0) {
    throw new Error("No content provided");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/generate-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, input_language, output_language }),
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



// import jsPDF from "jspdf";

// export function generatePDF(content) {
//   const doc = new jsPDF();

//   // Page setup
//   const pageHeight = doc.internal.pageSize.getHeight();
//   const pageWidth = doc.internal.pageSize.getWidth();
//   const margin = 20;
//   let y = margin;

//   // Loop through all entries
//   Object.entries(content).forEach(([key, value]) => {
//     // Add key (header)
//     doc.setFontSize(14);
//     let keyLines = doc.splitTextToSize(key, pageWidth - margin * 2);
//     keyLines.forEach(line => {
//       if (y > pageHeight - margin) {
//         doc.addPage();
//         y = margin;
//       }
//       doc.text(line, margin, y);
//       y += 8;
//     });

//     // Add value (normal text)
//     doc.setFontSize(12);
//     let valueLines = doc.splitTextToSize(value.toString(), pageWidth - margin * 2);
//     valueLines.forEach(line => {
//       if (y > pageHeight - margin) {
//         doc.addPage();
//         y = margin;
//       }
//       doc.text(line, margin, y);
//       y += 7;
//     });

//     y += 5; // extra spacing between entries
//   });

//   doc.save("content.pdf");
// }