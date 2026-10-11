import { parse } from "csv-parse/sync";
import { expandEvent, type EventPayload } from "./events";
export const importColumns = [
  "title",
  "start",
  "end",
  "timezone",
  "all_day",
  "location",
  "category",
  "organizer",
  "description",
  "frequency",
  "count",
] as const;
export type ImportMapping = Record<(typeof importColumns)[number], string>;
export type ImportCandidate = {
  source_row: number;
  payload: EventPayload | null;
  errors: string[];
  warnings: string[];
  input: Record<string, unknown>;
};
export const defaultMapping = Object.fromEntries(
  importColumns.map((c) => [c, c]),
) as ImportMapping;
export function parseCalendarCsv(
  source: string,
  mapping: ImportMapping,
  fallbackTimezone: string,
  delimiter: "," | ";" | "\t" = ",",
): ImportCandidate[] {
  if (Buffer.byteLength(source, "utf8") > 512 * 1024 || source.includes("\0"))
    throw new Error("CSV must be UTF-8 text up to 512 KiB without null bytes.");
  const records = parse(source, {
    bom: true,
    delimiter,
    skip_empty_lines: true,
    max_record_size: 20000,
    relax_column_count: false,
  }) as string[][];
  if (records.length < 2 || records.length > 501)
    throw new Error("CSV needs a header and between 1 and 500 event rows.");
  const headers = records[0].map((h) => h.trim());
  if (
    headers.length > 100 ||
    new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
  )
    throw new Error("Duplicate or excessive CSV headers.");
  const indexes = Object.fromEntries(
    importColumns.map((c) => [
      c,
      headers.findIndex(
        (h) => h.toLowerCase() === mapping[c].trim().toLowerCase(),
      ),
    ]),
  ) as Record<(typeof importColumns)[number], number>;
  if (
    ["title", "start", "end"].some(
      (c) => indexes[c as keyof typeof indexes] < 0,
    )
  )
    throw new Error("Map title, start and end columns explicitly.");
  const fingerprints = new Set<string>();
  const candidates = records.slice(1).map((row, i) => {
    const value = (c: keyof typeof indexes) =>
      indexes[c] < 0 ? "" : row[indexes[c]].trim();
    const errors: string[] = [],
      warnings: string[] = [];
    const allDay = value("all_day").toLowerCase();
    if (allDay && !["true", "false", "1", "0", "yes", "no"].includes(allDay))
      errors.push("all_day must be true/false, yes/no or 1/0.");
    const input = {
      title: value("title"),
      start_local: value("start"),
      end_local: value("end"),
      timezone: value("timezone") || fallbackTimezone,
      all_day: ["true", "yes", "1"].includes(allDay),
      location: value("location"),
      category: value("category") || "meeting",
      organizer: value("organizer"),
      description: value("description"),
      frequency: value("frequency") || "none",
      count: value("count") || 1,
    };
    if (!value("timezone"))
      warnings.push(
        `Using explicitly selected fallback timezone: ${fallbackTimezone}`,
      );
    if (!value("start") || !value("end"))
      errors.push("Missing date/time; no date was invented.");
    let payload: EventPayload | null = null;
    if (!errors.length) {
      try {
        payload = expandEvent(input);
      } catch {
        errors.push(
          "Correct required fields, timezone, dates, DST ambiguity or recurrence limits.",
        );
      }
    }
    if (payload) {
      const fingerprint = JSON.stringify([
        payload.title.toLocaleLowerCase("en-US"),
        payload.occurrences,
      ]);
      if (fingerprints.has(fingerprint)) {
        errors.push("Duplicate row in this file; publish one copy only.");
      } else fingerprints.add(fingerprint);
    }
    return { source_row: i + 2, payload, errors, warnings, input };
  });
  if (
    candidates.reduce(
      (total, row) => total + (row.payload?.occurrences.length ?? 0),
      0,
    ) > 1000
  )
    throw new Error(
      "Split this import into batches of at most 1,000 occurrences.",
    );
  return candidates;
}
