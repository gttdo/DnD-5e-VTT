// Client-side PDF → text (#110, Import-from-PDF).
//
// A character-sheet PDF (D&D Beyond export, form-fillable sheet, or a scan with
// a text layer) is read entirely in the browser: we pull the visible text out of
// every page and hand that string to the `parse-character-pdf` edge function,
// which runs an LLM to shape it into our builder state. Nothing but text leaves
// the device, and pdf.js is a ~1 MB dependency so it's imported lazily — the cost
// is only paid when someone actually imports a sheet.

/**
 * Extract the concatenated text of every page of a PDF File. Digital and
 * form-filled PDFs carry a real text layer (field values included); pure image
 * scans return little or nothing — the caller flags that as "couldn't read it".
 */
export const extractPdfText = async (file: File): Promise<string> => {
  // Lazy so pdf.js only loads for the import flow, not the whole app.
  const pdfjs = await import("pdfjs-dist");
  // Vite resolves this to a hashed URL for the worker bundle.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) pages.push(line);
  }
  await doc.destroy();
  return pages.join("\n\n");
};
