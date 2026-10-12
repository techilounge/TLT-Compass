import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import {
  Field,
  FormPanel,
  Hidden,
  SaveButton,
} from "@/components/workspace/forms";
import { EventForm } from "@/components/workspace/event-form";
import { localCalendarValue, type EventInput } from "@/modules/calendar/events";
import type { ImportCandidate } from "@/modules/calendar/import-csv";
import type { PdfCandidate } from "@/modules/calendar/import-pdf";
import { loadCalendarItems } from "@/modules/calendar/read";
import { saveImport } from "../actions";
export default async function ImportPreview({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; importId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId, importId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(importId).success)
    notFound();
  const { db, club, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/calendar`);
  const result = await db
    .from("calendar_imports")
    .select("id,file_name,source_sha256,source_kind,candidates,status,revision")
    .eq("club_id", clubId)
    .eq("id", importId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load import.");
  if (!result.data) notFound();
  const job = result.data;
  const candidates = job.candidates as ImportCandidate[];
  const q = await searchParams;
  const occurrences = candidates.flatMap((c) => c.payload?.occurrences ?? []);
  const first = occurrences.map((o) => o.starts_at).sort()[0],
    last = occurrences
      .map((o) => o.ends_at)
      .sort()
      .at(-1);
  const published =
    first && last ? await loadCalendarItems(db, clubId, first, last) : [];
  const action = saveImport.bind(null, clubId);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-8 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/calendar/import`}>← Imports</Link>
      <header>
        <p className="eyebrow">
          {club.name} · {job.status} · revision {job.revision}
        </p>
        <h1 className="mt-3 text-3xl font-bold">Review {job.file_name}</h1>
        <p className="mt-3 text-muted-foreground">
          {candidates.length} source rows. Correct or deselect unresolved and
          duplicate rows; verify every selected date and warning. Publication is
          atomic.
        </p>
      </header>
      {q.notice && (
        <p role="status" className="notice">
          {q.notice === "saved"
            ? "Import saved."
            : "Unable to save. Review conflicts, duplicate events, invalid rows and stale revisions. A failed publish creates no partial batch."}
        </p>
      )}
      {candidates.map((c, index) => {
        const p = c.payload;
        const overlaps = p
          ? published.filter(
              (e) =>
                e.status !== "cancelled" &&
                p.occurrences.some(
                  (o) =>
                    Date.parse(e.starts_at) < Date.parse(o.ends_at) &&
                    Date.parse(e.ends_at) > Date.parse(o.starts_at),
                ),
            )
          : [];
        const duplicate =
          p &&
          overlaps.some(
            (e) =>
              e.title.trim().toLowerCase() === p.title.trim().toLowerCase() &&
              p.occurrences.some(
                (o) =>
                  Date.parse(e.starts_at) === Date.parse(o.starts_at) &&
                  Date.parse(e.ends_at) === Date.parse(o.ends_at),
              ),
          );
        const initial: Partial<EventInput> = p
          ? {
              ...p,
              start_local: localCalendarValue(
                p.occurrences[0].starts_at,
                p.timezone,
              ),
              end_local: localCalendarValue(
                p.occurrences[0].ends_at,
                p.timezone,
              ),
              frequency: p.recurrence.frequency as EventInput["frequency"],
              count: p.recurrence.count,
            }
          : (c.input as Partial<EventInput>);
        return (
          <section key={index} className="panel space-y-4">
            <h2 className="text-xl font-bold">
              Source row {c.source_row}:{" "}
              {p?.title ?? String(c.input.title ?? "Unresolved event")}
            </h2>
            {job.source_kind === "pdf" && (
              <p className="text-sm text-muted-foreground">
                Source PDF page {(c as PdfCandidate).source_page} ·{" "}
                {(c as PdfCandidate).confidence} extraction. Source text:{" "}
                {(c as PdfCandidate).source_text}
              </p>
            )}
            {job.status === "preview" && (
              <Field label="Include this row in publication">
                <input
                  type="checkbox"
                  name="selected_rows"
                  value={index}
                  form="publish-import"
                  defaultChecked={!c.errors.length && !duplicate && !!p}
                  disabled={!!c.errors.length || !p || !!duplicate}
                />
              </Field>
            )}
            {c.errors.map((e, i) => (
              <p key={`e-${i}`} className="notice">
                {e}
              </p>
            ))}
            {c.warnings.map((w, i) => (
              <p key={`w-${i}`} className="text-sm">
                Warning: {w}
              </p>
            ))}
            {duplicate && (
              <p className="notice">
                Exact event already published. Deselect or correct this row;
                duplicates are blocked on publication.
              </p>
            )}
            {p && (
              <>
                <p>
                  {p.timezone} · {p.visibility} visibility · {p.location}
                </p>
                <ol className="space-y-2">
                  {p.occurrences.map((o) => (
                    <li key={o.starts_at}>
                      {localCalendarValue(o.starts_at, p.timezone, p.all_day)} →{" "}
                      {localCalendarValue(o.ends_at, p.timezone, p.all_day)}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {overlaps.length > 0 && (
              <div>
                <h3 className="font-semibold">Overlapping published events</h3>
                <ul className="mt-2 space-y-2">
                  {overlaps.map((e) => (
                    <li key={e.id}>
                      {e.title} · {localCalendarValue(e.starts_at, e.timezone)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {job.status === "preview" && (
              <FormPanel title="Correct this source row">
                <EventForm
                  clubId={clubId}
                  timezone={club.timezone}
                  initial={initial}
                  action={action}
                  operation="edit_row"
                  submitLabel="Save corrected row"
                  extras={{
                    import_id: importId,
                    row_index: String(index),
                    revision: String(job.revision),
                  }}
                />
              </FormPanel>
            )}
          </section>
        );
      })}
      {job.status === "preview" && (
        <form id="publish-import" action={action} className="panel space-y-4">
          <Hidden name="operation" value="publish" />
          <Hidden name="import_id" value={importId} />
          <Hidden name="revision" value={String(job.revision)} />
          <Field label="I reviewed the source, exact dates, visibility, duplicates and overlaps for all selected rows">
            <input type="checkbox" name="reviewed" required />
          </Field>
          <SaveButton>Publish selected reviewed events</SaveButton>
        </form>
      )}
      {job.status === "published" && (
        <FormPanel title="Roll back this import">
          <form action={action} className="space-y-4">
            <Hidden name="operation" value="rollback" />
            <Hidden name="import_id" value={importId} />
            <p>
              Cancel the imported events as one transaction. RSVP and attendance
              history remain. If any event was revised, reconcile it
              individually before rollback.
            </p>
            <SaveButton>Cancel imported batch</SaveButton>
          </form>
        </FormPanel>
      )}
      <p className="text-xs text-muted-foreground break-all">
        Source SHA-256: {job.source_sha256}. Original CSV stays private to
        authorized program managers.
      </p>
    </main>
  );
}
