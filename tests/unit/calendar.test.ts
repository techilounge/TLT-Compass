import { describe, expect, it } from "vitest";
import { expandEvent } from "../../modules/calendar/events";
import { calendarIcs, foldIcal } from "../../modules/calendar/ical";
const base = {
  title: "Meeting",
  timezone: "America/Chicago",
  start_local: "2026-10-25T10:00",
  end_local: "2026-10-25T11:00",
  frequency: "weekly",
  count: 3,
};
describe("calendar timezone and exchange boundaries", () => {
  it("keeps recurring local time across daylight saving", () => {
    const p = expandEvent(base);
    expect(p.occurrences.map((o) => o.starts_at)).toEqual([
      "2026-10-25T15:00:00Z",
      "2026-11-01T16:00:00Z",
      "2026-11-08T16:00:00Z",
    ]);
  });
  it("rejects DST gaps and ambiguous local times", () => {
    expect(() =>
      expandEvent({
        ...base,
        start_local: "2026-03-08T02:30",
        end_local: "2026-03-08T04:00",
        frequency: "none",
      }),
    ).toThrow();
    expect(() =>
      expandEvent({
        ...base,
        start_local: "2026-11-01T01:30",
        end_local: "2026-11-01T03:00",
        frequency: "none",
      }),
    ).toThrow();
  });
  it("rejects invalid month days, self-overlap and excessive horizons", () => {
    expect(() =>
      expandEvent({
        ...base,
        start_local: "2026-01-31T10:00",
        end_local: "2026-01-31T11:00",
        frequency: "monthly",
        count: 2,
      }),
    ).toThrow();
    expect(() =>
      expandEvent({ ...base, end_local: "2026-11-03T11:00" }),
    ).toThrow("overlap");
    expect(() =>
      expandEvent({ ...base, frequency: "monthly", count: 30 }),
    ).toThrow("two years");
  });
  it("preserves date-only exclusive all-day boundaries", () => {
    const p = expandEvent({
      ...base,
      all_day: true,
      start_local: "2026-10-25",
      end_local: "2026-10-26",
      frequency: "none",
    });
    expect(p.occurrences[0]).toEqual({
      starts_at: "2026-10-25T05:00:00Z",
      ends_at: "2026-10-26T05:00:00Z",
    });
  });
  it("escapes property injection and folds Unicode at UTF-8 boundaries", () => {
    const title = "É".repeat(100) + "\nBEGIN:VEVENT";
    for (const line of foldIcal(
      `SUMMARY:${title.replaceAll("\n", "\\n")}`,
    ).split("\r\n"))
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    const text = calendarIcs([
      {
        id: "synthetic",
        title,
        description: "x;y,z\\w",
        location: "Hall",
        timezone: "America/Chicago",
        all_day: true,
        starts_at: "2026-10-25T05:00:00Z",
        ends_at: "2026-10-26T05:00:00Z",
        status: "scheduled",
        revision: 2,
        updated_at: "2026-10-11T12:00:00Z",
      },
    ]);
    expect(text.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
    expect(text).toContain("DTSTART;VALUE=DATE:20261025");
    expect(text).toContain("SEQUENCE:2");
    expect(text).toContain("x\\;y\\,z\\\\w");
  });
});
