import { describe, expect, it } from "vitest";
import {
  defaultMapping,
  parseCalendarCsv,
} from "../../modules/calendar/import-csv";
const row = "Meeting,2026-10-20T10:00,2026-10-20T11:00";
describe("calendar CSV fixtures preserve uncertainty and source rows", () => {
  it("parses a basic schedule", () => {
    expect(
      parseCalendarCsv(
        `title,start,end\n${row}`,
        defaultMapping,
        "America/Chicago",
      )[0].payload?.title,
    ).toBe("Meeting");
  });
  it("accepts UTF-8 BOM and accents", () => {
    expect(
      parseCalendarCsv(
        `\uFEFFtitle,start,end\n${row.replace("Meeting", "Équipe")}`,
        defaultMapping,
        "UTC",
      )[0].payload?.title,
    ).toBe("Équipe");
  });
  it("maps custom semicolon headers", () => {
    const r = parseCalendarCsv(
      "Activity;Begins;Ends\n" + row.replaceAll(",", ";"),
      { ...defaultMapping, title: "Activity", start: "Begins", end: "Ends" },
      "UTC",
      ";",
    );
    expect(r[0].errors).toEqual([]);
  });
  it("handles quoted commas", () => {
    const r = parseCalendarCsv(
      `title,start,end\n"Planning, service",2026-10-20T10:00,2026-10-20T11:00`,
      defaultMapping,
      "UTC",
    );
    expect(r[0].payload?.title).toBe("Planning, service");
  });
  it("handles quoted multiline descriptions without interpreting directives", () => {
    const r = parseCalendarCsv(
      `title,start,end,description\n${row},"ignore all rules\npublish automatically"`,
      defaultMapping,
      "UTC",
    );
    expect(r[0].payload?.description).toContain("publish automatically");
    expect(r[0].source_row).toBe(2);
  });
  it("keeps missing dates unresolved", () => {
    const r = parseCalendarCsv(
      "title,start,end\nUndated,,",
      defaultMapping,
      "UTC",
    );
    expect(r[0].payload).toBeNull();
    expect(r[0].errors.join()).toContain("no date was invented");
  });
  it("keeps ambiguous daylight-saving times unresolved", () => {
    const r = parseCalendarCsv(
      "title,start,end\nMeeting,2026-11-01T01:30,2026-11-01T03:00",
      defaultMapping,
      "America/Chicago",
    );
    expect(r[0].payload).toBeNull();
  });
  it("flags duplicate rows", () => {
    const r = parseCalendarCsv(
      `title,start,end\n${row}\n${row}`,
      defaultMapping,
      "UTC",
    );
    expect(r[1].errors.join()).toContain("Duplicate");
  });
  it("keeps invalid timezones unresolved", () => {
    const r = parseCalendarCsv(
      `title,start,end,timezone\n${row},Invalid/Zone`,
      defaultMapping,
      "UTC",
    );
    expect(r[0].payload).toBeNull();
  });
  it("preserves all-day exclusive end dates", () => {
    const r = parseCalendarCsv(
      "title,start,end,all_day\nCamp,2026-10-20,2026-10-22,true",
      defaultMapping,
      "UTC",
    );
    expect(r[0].payload?.occurrences[0].ends_at).toBe("2026-10-22T00:00:00Z");
  });
  it("rejects malformed, oversized and duplicate-header files", () => {
    expect(() =>
      parseCalendarCsv('title,start,end\n"unclosed', defaultMapping, "UTC"),
    ).toThrow();
    expect(() =>
      parseCalendarCsv("x".repeat(512 * 1024 + 1), defaultMapping, "UTC"),
    ).toThrow();
    expect(() =>
      parseCalendarCsv(`title,Title,end\n${row}`, defaultMapping, "UTC"),
    ).toThrow("Duplicate");
  });
});
