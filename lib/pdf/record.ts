import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/** In-memory report generation: no external font requests or stored participant reports. */
export async function recordPdf(rows: unknown[][]): Promise<Uint8Array> {
  if (rows.length > 2500)
    throw new Error("PDF limit exceeded; use CSV for large records.");
  const doc = await PDFDocument.create();
  doc.setTitle("TLT Compass Record Book");
  doc.setAuthor("TLT Compass");
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(join(process.cwd(), "assets/fonts/DejaVuSans.ttf")),
    { subset: true },
  );
  let page: PDFPage;
  let y = 0;
  const width = 500;
  const supported = new Set(font.getCharacterSet());
  const text = (value: unknown) =>
    Array.from(String(value ?? ""))
      .map((c) => {
        const cp = c.codePointAt(0)!;
        if (c === "\n" || c === "\r" || c === "\t") return " ";
        if (cp < 32) return "";
        // Keep unsupported content explicit, rather than silently substituting a missing-glyph box.
        return supported.has(cp) ? c : `[U+${cp.toString(16).toUpperCase()}]`;
      })
      .join("");
  const addPage = () => {
    if (doc.getPageCount() >= 160)
      throw new Error("PDF page limit exceeded; use CSV.");
    page = doc.addPage([612, 792]);
    page.drawRectangle({
      x: 0,
      y: 750,
      width: 612,
      height: 42,
      color: rgb(0.65, 0.09, 0.18),
    });
    page.drawText("TLT COMPASS  /  RECORD BOOK", {
      x: 48,
      y: 765,
      size: 11,
      font,
      color: rgb(1, 1, 1),
    });
    y = 724;
  };
  const line = (value: unknown, size = 9, color = rgb(0.16, 0.19, 0.23)) => {
    for (const content of wrapPdfText(text(value), font, size, width)) {
      if (y < 60) addPage();
      page.drawText(content, { x: 48, y, font, size, color });
      y -= size + 5;
    }
  };
  addPage();
  line("Leadership, service and supervised completion", 17);
  y -= 12;
  for (const row of rows.slice(1, 7)) line(`${row[0]}: ${row[1]}`);
  y -= 12;
  line(
    "Only signed requirement completions are official. Points do not confer completion.",
  );
  line(
    "Private club record. Evidence references are indexes; confidential text is omitted.",
  );
  line(
    "Dates marked UTC are instants; attendance dates follow the club program timezone.",
  );
  y -= 16;
  const labels = rows[7];
  let section = "";
  for (const row of rows.slice(8)) {
    if (row[0] !== section) {
      section = String(row[0]);
      if (y < 130) addPage();
      y -= 8;
      line(
        section.replaceAll("_", " ").toUpperCase(),
        12,
        rgb(0.65, 0.09, 0.18),
      );
      y -= 6;
    }
    if (y < 115) addPage();
    for (let i = 1; i < row.length; i++) {
      if (row[i] !== undefined && row[i] !== null && row[i] !== "")
        line(`${labels[i] ?? "Reference"}: ${row[i]}`);
    }
    y -= 12;
  }
  if (rows.length === 8)
    line("No recorded activity or signed completions yet.");
  const total = doc.getPageCount();
  doc
    .getPages()
    .forEach((p, index) =>
      p.drawText(
        `TLT Compass | Private club record | ${index + 1} / ${total}`,
        { x: 48, y: 28, font, size: 8, color: rgb(0.35, 0.38, 0.42) },
      ),
    );
  return doc.save();
}

export function wrapPdfText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  // Character-level wrapping also handles long UUIDs, URLs and uninterrupted text.
  for (const char of text) {
    if (current && font.widthOfTextAtSize(current + char, size) > maxWidth) {
      lines.push(current.trimEnd());
      current = "";
    }
    current += char;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
