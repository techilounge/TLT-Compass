import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarItem } from "./ical";
export type CalendarDisplayItem = CalendarItem & {
  event_id: string;
  category: string;
  attendance_session_id: string | null;
};
export async function loadCalendarItems(
  db: SupabaseClient,
  clubId: string,
  from: string,
  to: string,
): Promise<CalendarDisplayItem[]> {
  type Occurrence = {
    id: string;
    event_id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    attendance_session_id: string | null;
  };
  const occurrences: Occurrence[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const result = await db
      .from("calendar_occurrences")
      .select("id,event_id,starts_at,ends_at,status,attendance_session_id", {
        count: "exact",
      })
      .eq("club_id", clubId)
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at")
      .order("id")
      .range(offset, offset + 499);
    if (result.error) throw new Error("Unable to load calendar.");
    if ((result.count ?? 0) > 5000)
      throw new Error("Calendar window too large; narrow the date range.");
    occurrences.push(...result.data);
    if (result.data.length < 500) break;
  }
  const ids = [...new Set(occurrences.map((o) => o.event_id))];
  type EventMeta = {
    id: string;
    title: string;
    description: string;
    location: string;
    timezone: string;
    all_day: boolean;
    category: string;
    revision: number;
    updated_at: string;
    status: string;
  };
  const metadata = new Map<string, EventMeta>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await db
      .from("calendar_events")
      .select(
        "id,title,description,location,timezone,all_day,category,revision,updated_at,status",
      )
      .eq("club_id", clubId)
      .in("id", ids.slice(offset, offset + 100));
    if (result.error) throw new Error("Unable to load event metadata.");
    for (const event of result.data) metadata.set(event.id, event);
  }
  return occurrences.flatMap((o) => {
    const e = metadata.get(o.event_id);
    return e
      ? [
          {
            ...e,
            ...o,
            status: e.status === "cancelled" ? "cancelled" : o.status,
          },
        ]
      : [];
  });
}
