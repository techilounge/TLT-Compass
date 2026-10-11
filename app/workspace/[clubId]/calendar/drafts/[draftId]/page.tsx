import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { Field, Hidden, SaveButton } from "@/components/workspace/forms";
import type { EventPayload } from "@/modules/calendar/events";
import { localCalendarValue } from "@/modules/calendar/events";
import { saveCalendar } from "../../actions";
export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; draftId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId, draftId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(draftId).success)
    notFound();
  const { db, club, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/calendar`);
  const [draft, conflicts] = await Promise.all([
    db
      .from("calendar_drafts")
      .select("*")
      .eq("club_id", clubId)
      .eq("id", draftId)
      .maybeSingle(),
    db.rpc("calendar_draft_conflicts", { target_draft: draftId }),
  ]);
  if (draft.error || conflicts.error)
    throw new Error("Unable to load event preview.");
  if (!draft.data) notFound();
  const p = draft.data.payload as EventPayload;
  const q = await searchParams;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-8 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/calendar`}>← Calendar</Link>
      <header>
        <p className="eyebrow">{club.name} · Private staff draft</p>
        <h1 className="mt-3 text-3xl font-bold">Review: {p.title}</h1>
        <p className="mt-3">
          {p.timezone} · {p.visibility} visibility · {draft.data.source_kind}{" "}
          source · {draft.data.status}
        </p>
      </header>
      {q.notice && (
        <p role="status" className="notice">
          {q.notice === "saved"
            ? "Draft saved."
            : "Unable to publish. Review conflicts or recreate the draft if the source event changed."}
        </p>
      )}
      <section className="panel space-y-3">
        <h2 className="text-xl font-bold">Exact event details</h2>
        <p>{p.description}</p>
        <p>
          {p.location} · {p.category} · {p.organizer}
        </p>
        <p>
          {p.recurrence.frequency} · {p.occurrences.length} occurrence(s).
          All-day end dates are exclusive.
        </p>
        <ol className="space-y-3">
          {p.occurrences.map((o, i) => (
            <li key={o.starts_at}>
              {i + 1}. {localCalendarValue(o.starts_at, p.timezone, p.all_day)}{" "}
              → {localCalendarValue(o.ends_at, p.timezone, p.all_day)}
            </li>
          ))}
        </ol>
      </section>
      <section className="panel space-y-3">
        <h2 className="text-xl font-bold">Conflict review</h2>
        {!conflicts.data?.length ? (
          <p>
            No current overlapping published events. Conflicts are checked again
            during publication.
          </p>
        ) : (
          <ul className="space-y-3">
            {conflicts.data.map(
              (c: {
                occurrence_id: string;
                title: string;
                starts_at: string;
                ends_at: string;
              }) => (
                <li key={c.occurrence_id}>
                  {c.title} · {localCalendarValue(c.starts_at, p.timezone)} →{" "}
                  {localCalendarValue(c.ends_at, p.timezone)}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      {draft.data.status === "draft" && (
        <>
          <form
            action={saveCalendar.bind(null, clubId)}
            className="panel space-y-4"
          >
            <Hidden name="operation" value="publish" />
            <Hidden name="draft_id" value={draftId} />
            <Field label="I reviewed the exact dates, visibility and any overlaps">
              <input type="checkbox" name="conflicts_reviewed" required />
            </Field>
            <SaveButton>Publish reviewed event</SaveButton>
          </form>
          <form action={saveCalendar.bind(null, clubId)}>
            <Hidden name="operation" value="discard" />
            <Hidden name="draft_id" value={draftId} />
            <SaveButton>Discard draft</SaveButton>
          </form>
        </>
      )}
      {draft.data.published_event_id && (
        <Link
          className="text-primary underline"
          href={`/workspace/${clubId}/calendar/${draft.data.published_event_id}`}
        >
          Open published event
        </Link>
      )}
    </main>
  );
}
