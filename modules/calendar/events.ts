import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
export const eventInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  location: z.string().trim().max(300).default(""),
  category: z.string().trim().min(1).max(80).default("meeting"),
  organizer: z.string().trim().max(120).default(""),
  timezone: z.string().trim().min(1).max(100),
  start_local: z.string().min(10).max(30),
  end_local: z.string().min(10).max(30),
  all_day: z.boolean().default(false),
  visibility: z.enum(["club", "staff"]).default("club"),
  frequency: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  count: z.coerce.number().int().min(1).max(104).default(1),
});
export type EventInput = z.infer<typeof eventInput>;
export type EventPayload = {
  title: string;
  description: string;
  location: string;
  category: string;
  organizer: string;
  timezone: string;
  all_day: boolean;
  visibility: "club" | "staff";
  recurrence: { frequency: string; count: number };
  occurrences: { starts_at: string; ends_at: string }[];
};
export function expandEvent(raw: unknown): EventPayload {
  const i = eventInput.parse(raw);
  const start = i.all_day
    ? Temporal.PlainDate.from(i.start_local.slice(0, 10)).toPlainDateTime()
    : Temporal.PlainDateTime.from(i.start_local);
  const end = i.all_day
    ? Temporal.PlainDate.from(i.end_local.slice(0, 10)).toPlainDateTime()
    : Temporal.PlainDateTime.from(i.end_local);
  if (Temporal.PlainDateTime.compare(start, end) >= 0)
    throw new Error("End must follow start; all-day end dates are exclusive.");
  const occurrences: EventPayload["occurrences"] = [];
  const count = i.frequency === "none" ? 1 : i.count;
  for (let n = 0; n < count; n++) {
    const delta =
      i.frequency === "daily"
        ? { days: n }
        : i.frequency === "weekly"
          ? { weeks: n }
          : i.frequency === "monthly"
            ? { months: n }
            : { days: 0 };
    // Reject invalid month-days and DST gaps/folds instead of moving the meeting silently.
    const localStart = start.add(delta, { overflow: "reject" }),
      localEnd = end.add(delta, { overflow: "reject" });
    const begins = localStart.toZonedDateTime(i.timezone, {
      disambiguation: "reject",
    });
    const ends = localEnd.toZonedDateTime(i.timezone, {
      disambiguation: "reject",
    });
    if (
      ends.epochMilliseconds <= begins.epochMilliseconds ||
      ends.epochMilliseconds - begins.epochMilliseconds > 14 * 86400000
    )
      throw new Error("Event duration must be positive and at most 14 days.");
    if (
      occurrences.length &&
      begins.epochMilliseconds < Date.parse(occurrences.at(-1)!.ends_at)
    )
      throw new Error("Recurring occurrences overlap each other.");
    if (
      begins.epochMilliseconds -
        start.toZonedDateTime(i.timezone, { disambiguation: "reject" })
          .epochMilliseconds >
      731 * 86400000
    )
      throw new Error("Recurrence horizon exceeds two years.");
    occurrences.push({
      starts_at: begins.toInstant().toString(),
      ends_at: ends.toInstant().toString(),
    });
  }
  return {
    title: i.title,
    description: i.description,
    location: i.location,
    category: i.category,
    organizer: i.organizer,
    timezone: i.timezone,
    all_day: i.all_day,
    visibility: i.visibility,
    recurrence: { frequency: i.frequency, count },
    occurrences,
  };
}
export function localCalendarValue(
  instant: string,
  timezone: string,
  allDay = false,
): string {
  const value = Temporal.Instant.from(instant).toZonedDateTimeISO(timezone);
  return allDay
    ? value.toPlainDate().toString()
    : value.toPlainDateTime().toString({ smallestUnit: "minute" });
}
