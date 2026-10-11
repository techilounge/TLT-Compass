import { getDocumentProxy } from "unpdf";
import process from "node:process";
import { Buffer } from "node:buffer";
// PDF.js includes code paths using this newer Promise method on Node 22.
if (!Promise.try)
  Promise.try = (callback, ...args) =>
    new Promise((resolve) => resolve(callback(...args)));
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 8 * 1024 * 1024) process.exit(2);
}
try {
  const { base64 } = JSON.parse(input),
    data = new Uint8Array(Buffer.from(base64, "base64"));
  if (
    data.length > 5 * 1024 * 1024 ||
    Buffer.from(data.subarray(0, 5)).toString() !== "%PDF-"
  )
    throw new Error();
  const pdf = await getDocumentProxy(data, {
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    enableXfa: false,
    maxImageSize: 0,
  });
  if (
    pdf.numPages > 30 ||
    (await pdf.getJSActions()) ||
    (await pdf.getAttachments())
  )
    throw new Error();
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n),
      content = await page.getTextContent();
    if (content.items.length > 20000) throw new Error();
    const grouped = new Map();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const line = grouped.get(y) ?? [];
      line.push({ x: item.transform[4], text: item.str });
      grouped.set(y, line);
    }
    const lines = [...grouped.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.text)
          .join(" ")
          .trim(),
      );
    pages.push({ page: n, lines });
    page.cleanup();
  }
  await pdf.loadingTask.destroy();
  const result = JSON.stringify({ pages });
  if (result.length > 1024 * 1024) throw new Error();
  process.stdout.write(result);
} catch {
  process.stderr.write(
    "PDF extraction failed validation or resource limits.\n",
  );
  process.exitCode = 1;
}
