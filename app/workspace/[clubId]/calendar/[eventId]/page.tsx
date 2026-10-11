import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { localCalendarValue, type EventInput } from "@/modules/calendar/events";
import {
  Field,
  FormPanel,
  Hidden,
  SaveButton,
} from "@/components/workspace/forms";
import { EventForm } from "@/components/workspace/event-form";
import { LocalDate } from "@/components/local-date";
import { saveCalendar } from "../actions";
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; eventId: string }>;
  searchParams: Promise<{ occurrence?: string; notice?: string }>;
}) {
  const { clubId, eventId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(eventId).success)
    notFound();
  const { db, club, roles } = await requireClub(clubId);
  const q = await searchParams;
  const manager = roles.some((r) => ["director", "coordinator"].includes(r)),
    staff = roles.some((r) => r !== "participant");
  const [event, occurrences, people, seasons] = await Promise.all([
    db
      .from("calendar_events")
      .select("*")
      .eq("club_id", clubId)
      .eq("id", eventId)
      .maybeSingle(),
    db
      .from("calendar_occurrences")
      .select("*")
      .eq("club_id", clubId)
      .eq("event_id", eventId)
      .order("sequence")
      .limit(104),
    db
      .from("tlt_participants")
      .select("id,public_alias")
      .eq("club_id", clubId)
      .order("public_alias")
      .limit(100),
    manager
      ? db
          .from("seasons")
          .select("id,name")
          .eq("club_id", clubId)
          .order("starts_on", { ascending: false })
          .limit(100)
      : null,
  ]);
  if ([event, occurrences, people, seasons].some((r) => r?.error))
    throw new Error("Unable to load event.");
  if (!event.data) notFound();
  const e = event.data;
  const selected = q.occurrence
    ? occurrences.data!.find((o) => o.id === q.occurrence)
    : (occurrences.data!.find(
        (o) => o.status === "scheduled" && new Date(o.ends_at) > new Date(),
      ) ?? occurrences.data![0]);
  if (!selected) notFound();
  const responses = await db
    .from("event_rsvps")
    .select("participant_id,response")
    .eq("club_id", clubId)
    .eq("occurrence_id", selected.id)
    .limit(100);
  if (responses.error) throw new Error("Unable to load RSVP.");
  const action = saveCalendar.bind(null, clubId);
  const first =
    occurrences.data!.find((o) => o.status === "scheduled") ??
    occurrences.data![0];
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-8 px-5 py-10"
    >
      <nav aria-label="Event navigation" className="flex flex-wrap gap-5">
        <Link href={`/workspace/${clubId}/calendar`}>← Calendar</Link>
        {staff && (
          <a href={`/workspace/${clubId}/calendar/roster/${selected.id}`}>
            Download accessible roster (CSV)
          </a>
        )}
      </nav>
      <header>
        <p className="eyebrow">
          {club.name} · {e.status} · revision {e.revision}
        </p>
        <h1 className="mt-3 text-3xl font-bold">{e.title}</h1>
        <p className="mt-3 text-muted-foreground">
          {e.category} · {e.location} · {e.organizer} · {e.visibility}{" "}
          visibility
        </p>
        <p className="mt-3 whitespace-pre-wrap">{e.description}</p>
      </header>
      {q.notice && (
        <p role="status" className="notice">
          {q.notice === "saved"
            ? "Event saved."
            : "Unable to save. Check event state, consent, dates and permissions."}
        </p>
      )}
      <form method="get" className="panel flex flex-wrap items-end gap-4">
        <Field label="Occurrence">
          <select name="occurrence" defaultValue={selected.id}>
            {occurrences.data!.map((o) => (
              <option key={o.id} value={o.id}>
                {localCalendarValue(o.starts_at, e.timezone, e.all_day)} ·{" "}
                {o.status}
              </option>
            ))}
          </select>
        </Field>
        <SaveButton>Open occurrence</SaveButton>
      </form>
      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Selected occurrence</h2>
        <p>
          {e.all_day ? (
            `${localCalendarValue(selected.starts_at, e.timezone, true)} to ${localCalendarValue(selected.ends_at, e.timezone, true)} (end exclusive)`
          ) : (
            <>
              <LocalDate value={selected.starts_at} /> →{" "}
              <LocalDate value={selected.ends_at} />
            </>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          Event timezone: {e.timezone}. Timed events display in your device
          timezone.
        </p>
        <p>{selected.status}</p>
        {e.status === "published" &&
          selected.status === "scheduled" &&
          new Date(selected.starts_at) > new Date() && (
            <form action={action} className="grid gap-4 sm:grid-cols-2">
              <Hidden name="operation" value="rsvp" />
              <Hidden name="occurrence_id" value={selected.id} />
              <Hidden name="event_id" value={eventId} />
              <Field label="Participant">
                <select name="participant_id" required>
                  {people.data!.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.public_alias}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="RSVP">
                <select name="response">
                  <option value="yes">Yes</option>
                  <option value="maybe">Maybe</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <SaveButton>Save RSVP</SaveButton>
            </form>
          )}
        <ul className="space-y-2">
          {responses.data.map((r) => (
            <li key={r.participant_id}>
              {people.data!.find((p) => p.id === r.participant_id)
                ?.public_alias ?? "Accessible participant"}
              : {r.response}
            </li>
          ))}
        </ul>
        {selected.attendance_session_id ? (
          <Link
            className="text-primary underline"
            href={`/workspace/${clubId}/attendance`}
          >
            Open linked attendance register
          </Link>
        ) : (
          manager &&
          selected.status === "scheduled" &&
          new Date(selected.starts_at) <= new Date() && (
            <FormPanel title="Create linked attendance register">
              <form action={action} className="space-y-4">
                <Hidden name="operation" value="attendance" />
                <Hidden name="event_id" value={eventId} />
                <Hidden name="occurrence_id" value={selected.id} />
                <Field label="Season">
                  <select name="season_id" required>
                    {seasons?.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Attendance required">
                  <input
                    type="checkbox"
                    name="attendance_required"
                    defaultChecked
                  />
                </Field>
                <Field label="Uniform required">
                  <input
                    type="checkbox"
                    name="uniform_required"
                    defaultChecked
                  />
                </Field>
                <Field label="Excused absence counts absent">
                  <input type="checkbox" name="excused_counts_absent" />
                </Field>
                <Field label="Uniform denominator">
                  <select name="uniform_basis">
                    <option value="present_only">
                      Present participants only
                    </option>
                    <option value="all_required">
                      All required attendance
                    </option>
                  </select>
                </Field>
                <SaveButton>Create register</SaveButton>
              </form>
            </FormPanel>
          )
        )}
      </section>
      {manager && first && (
        <FormPanel title="Revise the event series (review before replacing)">
          <EventForm
            clubId={clubId}
            timezone={club.timezone}
            baseEvent={eventId}
            revision={e.revision}
            initial={{
              title: e.title,
              description: e.description,
              location: e.location,
              category: e.category,
              organizer: e.organizer,
              timezone: e.timezone,
              all_day: e.all_day,
              visibility: e.visibility,
              frequency: e.recurrence.frequency as EventInput["frequency"],
              count: e.recurrence.count,
              start_local: localCalendarValue(first.starts_at, e.timezone),
              end_local: localCalendarValue(first.ends_at, e.timezone),
            }}
          />
        </FormPanel>
      )}
      {manager && e.status === "published" && (
        <FormPanel title="Cancel this entire event series">
          <form action={action} className="space-y-4">
            <Hidden name="operation" value="cancel" />
            <Hidden name="event_id" value={eventId} />
            <Hidden name="revision" value={String(e.revision)} />
            <p>
              All occurrences will be marked cancelled. RSVP and attendance
              history remain available.
            </p>
            <SaveButton>Cancel series</SaveButton>
          </form>
        </FormPanel>
      )}
    </main>
  );
}
