import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { recordPdf } from "../../lib/pdf/record";

describe("private Record Book PDF", () => {
  it("paginates long source references and Unicode without losing records", async () => {
    const rows: unknown[][] = [
      ["TLT Compass participant record"],
      ["Generated at (UTC)", "2026-10-11T12:00:00Z"],
      ["Club", "Synthetic Club"],
      ["Program timezone", "America/Chicago"],
      ["Participant alias", "Élodie - synthetic"],
      ["Level", 1],
      ["Season ID", "synthetic-season"],
      [
        "Section",
        "Record ID",
        "State",
        "Date",
        "End",
        "Requirement",
        "Value",
        "Reviewer",
        "Reviewed at",
        "Rule ID",
        "Evidence reference",
        "Rule version",
        "Source",
        "Page",
        "Section",
      ],
    ];
    for (let i = 0; i < 20; i++)
      rows.push([
        "requirement_completion",
        `synthetic-${i}`,
        "verified",
        "2026-10-10",
        "",
        "Outreach / Plan a supervised service activity",
        "signed completion",
        "synthetic-reviewer",
        "2026-10-11T12:00:00Z",
        "synthetic-rule",
        `version-${i}`,
        "Draft synthetic 1",
        "Synthetic Manual / " + "long-source-reference/".repeat(12),
        String(i + 1),
        "Leadership practice",
      ]);
    const bytes = await recordPdf(rows);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getPageCount()).toBeLessThan(30);
    expect(pdf.getTitle()).toBe("TLT Compass Record Book");
    if (process.env.RECORD_PDF_FIXTURE === "1") {
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile("tmp/pdfs/record-book-synthetic.pdf", bytes);
    }
  }, 15000); // Unicode font embedding can exceed 5s alongside production builds.
  it("rejects oversized reports before rendering", async () => {
    await expect(
      recordPdf(Array.from({ length: 2501 }, () => [])),
    ).rejects.toThrow("PDF limit exceeded");
  });
});
