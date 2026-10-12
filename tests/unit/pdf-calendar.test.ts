import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractCalendarPdf } from "../../lib/pdf/extract-calendar";
import { candidatesFromPdfLines } from "../../modules/calendar/import-pdf";
async function fixture(
  lines: string[],
  options: { pages?: number; script?: boolean } = {},
) {
  const pdf = await PDFDocument.create();
  for (let p = 0; p < (options.pages ?? 1); p++) {
    const page = pdf.addPage();
    for (let i = 0; i < lines.length; i++)
      page.drawText(lines[i], { x: 50, y: 700 - i * 30, size: 11 });
  }
  if (options.script)
    pdf.addJavaScript("unsafe", "app.alert('must never execute')");
  return Buffer.from(await pdf.save()).toString("base64");
}
describe("bounded PDF schedule fixtures", () => {
  it("extracts explicit source-page rows for review", async () => {
    const result = await extractCalendarPdf(
      await fixture(["Meeting | 2026-10-20 | 10:00 | 11:00"]),
    );
    const candidates = candidatesFromPdfLines(result.pages, "UTC");
    expect(candidates[0].source_page).toBe(1);
    expect(candidates[0].payload?.title).toBe("Meeting");
    expect(candidates[0].warnings.join()).toContain("human");
  }, 30000);
  it("preserves multiple-page provenance", async () => {
    const result = await extractCalendarPdf(
      await fixture(["Meeting | 2026-10-20 | 10:00 | 11:00"], { pages: 2 }),
    );
    expect(
      candidatesFromPdfLines(result.pages, "UTC").map((c) => c.source_page),
    ).toEqual([1, 2]);
  }, 30000);
  it("keeps missing/ambiguous date formats unresolved", async () => {
    const result = await extractCalendarPdf(
      await fixture(["October 20 2026 - meeting - time to be confirmed"]),
    );
    const c = candidatesFromPdfLines(result.pages, "UTC")[0];
    expect(c.payload).toBeNull();
    expect(c.errors.join()).toContain("none were invented");
  }, 30000);
  it("does not invent an image-only schedule", async () => {
    const result = await extractCalendarPdf(await fixture([]));
    const c = candidatesFromPdfLines(result.pages, "UTC")[0];
    expect(c.payload).toBeNull();
    expect(c.errors.join()).toContain("OCR/vision");
  }, 30000);
  it("rejects active PDF actions and excessive page counts", async () => {
    await expect(
      extractCalendarPdf(await fixture(["Schedule"], { script: true })),
    ).rejects.toThrow();
    await expect(
      extractCalendarPdf(await fixture([], { pages: 31 })),
    ).rejects.toThrow();
  }, 30000);
});
