"use client";
import { useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
function instant(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return local === value ? date.toISOString() : "";
}
export function HourTimes() {
  const zone = useSyncExternalStore(subscribe, timezone, () => "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Enter times in your device timezone: {zone || "detecting…"}. During a
        repeated daylight-saving hour, the earlier occurrence is used.
      </p>
      <label className="field-label">
        Start time
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </label>
      <label className="field-label">
        End time
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
      </label>
      <input name="starts_at" type="hidden" value={instant(start)} />
      <input name="ends_at" type="hidden" value={instant(end)} />
      {!!start && !!end && (!instant(start) || !instant(end)) && (
        <p role="alert">
          Choose valid local times. A time skipped by daylight saving cannot be
          used.
        </p>
      )}
    </>
  );
}
