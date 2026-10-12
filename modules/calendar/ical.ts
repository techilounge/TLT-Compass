import { localCalendarValue } from "./events";
export type CalendarItem = {
  id: string;
  title: string;
  description: string;
  location: string;
  timezone: string;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  status: string;
  revision: number;
  updated_at: string;
};
const escapeText = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
const utc = (value: string) =>
  new Date(value)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
export function foldIcal(line: string): string {
  const output: string[] = [];
  let part = "";
  let size = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (size + bytes > 75) {
      output.push(part);
      part = " ";
      size = 1;
    }
    part += character;
    size += bytes;
  }
  output.push(part);
  return output.join("\r\n");
}
export function calendarIcs(items: CalendarItem[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TLT Compass//Club Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@tlt-compass`,
      `DTSTAMP:${utc(item.updated_at)}`,
      `SEQUENCE:${item.revision}`,
      `SUMMARY:${escapeText(item.title)}`,
      `DESCRIPTION:${escapeText(item.description)}`,
      `LOCATION:${escapeText(item.location)}`,
    );
    if (item.all_day)
      lines.push(
        `DTSTART;VALUE=DATE:${localCalendarValue(item.starts_at, item.timezone, true).replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${localCalendarValue(item.ends_at, item.timezone, true).replaceAll("-", "")}`,
      );
    else
      lines.push(
        `DTSTART:${utc(item.starts_at)}`,
        `DTEND:${utc(item.ends_at)}`,
      );
    lines.push(
      `STATUS:${item.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcal).join("\r\n") + "\r\n";
}
