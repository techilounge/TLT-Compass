import { randomUUID } from "node:crypto";
import { Field, Hidden, SaveButton } from "./forms";
import { CalendarTimezone } from "./calendar-timezone";
import { saveCalendar } from "@/app/workspace/[clubId]/calendar/actions";
import type { EventInput } from "@/modules/calendar/events";
export function EventForm({
  clubId,
  timezone,
  initial,
  baseEvent,
  revision = 0,
  action,
  operation = "draft",
  extras = {},
  submitLabel = "Create review draft",
}: {
  clubId: string;
  timezone: string;
  initial?: Partial<EventInput>;
  baseEvent?: string;
  revision?: number;
  action?: (form: FormData) => Promise<void>;
  operation?: string;
  extras?: Record<string, string>;
  submitLabel?: string;
}) {
  return (
    <form
      action={action ?? saveCalendar.bind(null, clubId)}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Hidden name="operation" value={operation} />
      {Object.entries(extras).map(([name, value]) => (
        <Hidden key={name} name={name} value={value} />
      ))}
      <Hidden name="request_id" value={randomUUID()} />
      <Hidden name="base_event" value={baseEvent ?? ""} />
      <Hidden name="base_revision" value={String(revision)} />
      <Field label="Title">
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={initial?.title}
        />
      </Field>
      <CalendarTimezone fallback={timezone} fixed={initial?.timezone} />
      <Field label="Start local date/time">
        <input
          name="start_local"
          type="datetime-local"
          required
          defaultValue={initial?.start_local}
        />
      </Field>
      <Field label="End local date/time">
        <input
          name="end_local"
          type="datetime-local"
          required
          defaultValue={initial?.end_local}
        />
      </Field>
      <Field label="All day (start/end dates only; end date exclusive)">
        <input
          name="all_day"
          type="checkbox"
          defaultChecked={initial?.all_day}
        />
      </Field>
      <Field label="Repeat">
        <select name="frequency" defaultValue={initial?.frequency ?? "none"}>
          {["none", "daily", "weekly", "monthly"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="Occurrences (up to 104, within two years)">
        <input
          name="count"
          type="number"
          min={1}
          max={104}
          required
          defaultValue={initial?.count ?? 1}
        />
      </Field>
      <Field label="Visibility">
        <select name="visibility" defaultValue={initial?.visibility ?? "club"}>
          <option value="club">Club members</option>
          <option value="staff">Adults only</option>
        </select>
      </Field>
      <Field label="Category">
        <input
          name="category"
          required
          maxLength={80}
          defaultValue={initial?.category ?? "meeting"}
        />
      </Field>
      <Field label="Location">
        <input
          name="location"
          maxLength={300}
          defaultValue={initial?.location}
        />
      </Field>
      <Field label="Organizer / responsible adult">
        <input
          name="organizer"
          maxLength={120}
          defaultValue={initial?.organizer}
        />
      </Field>
      <Field label="Description (club-visible; omit confidential information)">
        <textarea
          name="description"
          maxLength={4000}
          defaultValue={initial?.description}
        />
      </Field>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Preview precedes publication. Times use the selected IANA timezone. DST
        gaps, ambiguous times, invalid monthly dates and overlapping recurrences
        require correction.
      </p>
      <SaveButton>{submitLabel}</SaveButton>
    </form>
  );
}
