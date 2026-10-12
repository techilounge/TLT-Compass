"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "";

/** Render an instant in the viewer's current browser timezone after hydration. */
export function LocalDate({ value }: { value: string }) {
  const timezone = useSyncExternalStore(subscribe, getTimezone, serverTimezone);
  const label = timezone
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(value))
    : value;
  return (
    <time dateTime={value} title={timezone}>
      {label}
    </time>
  );
}
