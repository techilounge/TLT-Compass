import { expandEvent } from "./events";
import type { ImportCandidate } from "./import-csv";
export type PdfCandidate = ImportCandidate & {
  source_page: number;
  source_text: string;
  confidence: "low" | "explicit";
};
/** Deterministic first pass. Unrecognized dates remain null for human correction. */
export function candidatesFromPdfLines(
  pages: { page: number; lines: string[] }[],
  timezone: string,
): PdfCandidate[] {
  const candidates: PdfCandidate[] = [];
  for (const page of pages) {
    for (const line of page.lines) {
      if (
        !/\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d/i.test(
          line,
        )
      )
        continue;
      if (candidates.length >= 500)
        throw new Error("PDF exceeds 500 candidate rows.");
      const fields = line.split(/\s*\|\s*/);
      const explicit =
        fields.length >= 4 &&
        /^\d{4}-\d{2}-\d{2}$/.test(fields[1]) &&
        /^\d{2}:\d{2}$/.test(fields[2]) &&
        /^\d{2}:\d{2}$/.test(fields[3]);
      const input = {
        title: explicit ? fields[0] : line.slice(0, 160),
        start_local: explicit ? `${fields[1]}T${fields[2]}` : "",
        end_local: explicit ? `${fields[1]}T${fields[3]}` : "",
        timezone: fields[4] || timezone,
        frequency: "none",
        count: 1,
      };
      const errors: string[] = [],
        warnings = [
          "PDF extraction needs human source-page review; no event is auto-published.",
        ];
      let payload: ImportCandidate["payload"] = null;
      if (explicit) {
        try {
          payload = expandEvent(input);
        } catch {
          errors.push("Correct the extracted timezone, dates or time range.");
        }
      } else
        errors.push(
          "Date/time format is unresolved. Supply exact dates; none were invented.",
        );
      candidates.push({
        source_row: candidates.length + 1,
        source_page: page.page,
        source_text: line.slice(0, 2000),
        confidence: explicit ? "explicit" : "low",
        payload,
        input,
        errors,
        warnings,
      });
    }
  }
  if (!candidates.length)
    candidates.push({
      source_row: 1,
      source_page: pages[0]?.page ?? 1,
      source_text: pages[0]?.lines.slice(0, 5).join(" ").slice(0, 2000) ?? "",
      confidence: "low",
      payload: null,
      input: {
        title: "Unresolved PDF schedule",
        timezone,
        start_local: "",
        end_local: "",
      },
      errors: [
        "No explicit schedule rows found. Scanned PDFs require an approved OCR/vision path or manual entry.",
      ],
      warnings: ["Do not infer missing dates from context."],
    });
  return candidates;
}
