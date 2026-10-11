"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { Field } from "./forms";
const subscribe = () => () => {};
export function CalendarTimezone({
  fallback,
  fixed,
}: {
  fallback: string;
  fixed?: string;
}) {
  const detected = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => fallback,
  );
  const [edited, setEdited] = useState<string | null>(null);
  const listId = useId();
  return (
    <Field label="IANA timezone">
      <input
        name="timezone"
        required
        value={edited ?? fixed ?? detected}
        onChange={(e) => setEdited(e.target.value)}
        list={listId}
      />
      <datalist id={listId}>
        {[
          ...new Set([
            detected,
            fallback,
            "America/Chicago",
            "America/New_York",
            "America/Denver",
            "America/Los_Angeles",
            "UTC",
          ]),
        ].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Field>
  );
}
