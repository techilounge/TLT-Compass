"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { CalendarDisplayItem } from "@/modules/calendar/read";
const subscribe = () => () => {};
export function CalendarView({
  clubId,
  items,
  view,
  date,
  category,
  fallbackTimezone,
}: {
  clubId: string;
  items: CalendarDisplayItem[];
  view: "month" | "week" | "agenda";
  date?: string;
  category: string;
  fallbackTimezone: string;
}) {
  const timezone = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => fallbackTimezone,
  );
  const anchor = date
    ? Temporal.PlainDate.from(date)
    : Temporal.Now.plainDateISO(timezone);
  const start =
    view === "month"
      ? anchor
          .with({ day: 1 })
          .subtract({ days: anchor.with({ day: 1 }).dayOfWeek % 7 })
      : view === "week"
        ? anchor.subtract({ days: anchor.dayOfWeek % 7 })
        : anchor;
  const days = view === "month" ? 42 : view === "week" ? 7 : 31;
  const filtered = items.filter((i) => !category || i.category === category);
  const link = (d: Temporal.PlainDate) =>
    `/workspace/${clubId}/calendar?view=${view}&date=${d}&category=${encodeURIComponent(category)}`;
  const delta =
    view === "month"
      ? { months: 1 }
      : view === "week"
        ? { days: 7 }
        : { days: 31 };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href={link(anchor.subtract(delta))}>← Previous</Link>
        <h2 className="text-xl font-bold">
          {anchor.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <Link href={link(anchor.add(delta))}>Next →</Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Times and day groups use your timezone: {timezone}. All-day dates retain
        the event timezone.
      </p>
      <div
        className={
          view === "agenda" ? "space-y-4" : "grid gap-2 md:grid-cols-7"
        }
      >
        {Array.from({ length: days }, (_, n) => start.add({ days: n })).map(
          (day) => {
            const matches = filtered.filter((i) => {
              const zone = i.all_day ? i.timezone : timezone;
              const first = Temporal.Instant.from(i.starts_at)
                .toZonedDateTimeISO(zone)
                .toPlainDate();
              const last = Temporal.Instant.from(i.ends_at)
                .subtract({ nanoseconds: 1 })
                .toZonedDateTimeISO(zone)
                .toPlainDate();
              return (
                Temporal.PlainDate.compare(day, first) >= 0 &&
                Temporal.PlainDate.compare(day, last) <= 0
              );
            });
            if (view === "agenda" && !matches.length) return null;
            return (
              <section
                key={day.toString()}
                className="min-h-24 rounded-lg border border-border bg-card p-3"
              >
                <h3 className="text-sm font-semibold">
                  {day.toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                <ul className="mt-3 space-y-3">
                  {matches.map((i) => (
                    <li key={i.id} className="text-sm">
                      <Link
                        className="font-semibold text-primary underline"
                        href={`/workspace/${clubId}/calendar/${i.event_id}?occurrence=${i.id}`}
                      >
                        {i.title}
                      </Link>
                      <p>
                        {i.status === "cancelled"
                          ? "Cancelled"
                          : i.all_day
                            ? "All day"
                            : new Intl.DateTimeFormat(undefined, {
                                timeZone: timezone,
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(i.starts_at))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {i.location}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          },
        )}
      </div>
      {!filtered.some(
        (i) =>
          Temporal.Instant.from(i.starts_at)
            .toZonedDateTimeISO(timezone)
            .toPlainDate()
            .since(start).days >= 0,
      ) && <p>No events in this window.</p>}
    </section>
  );
}
