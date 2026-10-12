import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid, departmentLabels } from "@/modules/program-rules/contracts";
import {
  Field,
  FormPanel,
  Hidden,
  SaveButton,
  DepartmentSelect,
} from "@/components/workspace/forms";
import { HourTimes } from "@/components/workspace/hour-times";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { saveHours } from "./actions";
export default async function HoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ participant?: string; notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, user, roles } = await requireClub(clubId);
  const query = await searchParams;
  const participants = await db
    .from("tlt_participants")
    .select("id,public_alias,profile_id")
    .eq("club_id", clubId)
    .order("public_alias")
    .limit(100);
  if (participants.error) throw new Error("Unable to load participants.");
  const selected = query.participant
    ? participants.data.find((p) => p.id === query.participant)
    : participants.data[0];
  if (query.participant && !selected) notFound();
  const [entries, summary] = selected
    ? await Promise.all([
        db
          .from("training_hours")
          .select("*")
          .eq("club_id", clubId)
          .eq("participant_id", selected.id)
          .order("starts_at", { ascending: false })
          .limit(200),
        db.rpc("training_hours_summary", { target_participant: selected.id }),
      ])
    : [null, null];
  if (entries?.error || summary?.error)
    throw new Error("Unable to load training hours.");
  const totals = summary?.data?.[0];
  const staff = roles.some((r) => r !== "participant");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-8 px-5 py-10"
    >
      <nav aria-label="Training navigation" className="flex flex-wrap gap-5">
        <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
        <Link href={`/workspace/${clubId}/attendance`}>
          Attendance & uniform
        </Link>
      </nav>
      <header>
        <p className="eyebrow">{club.name}</p>
        <h1 className="mt-3 text-3xl font-bold">Workshop & lab hours</h1>
        <p className="mt-3 text-muted-foreground">
          Training is separate from game points. Overlapping workshop and lab
          entries cannot be counted twice. An authorized adult reviews each
          entry; no self-approval.
        </p>
      </header>
      {query.notice && (
        <p role="status" className="notice">
          {query.notice === "saved"
            ? "Training hours saved."
            : "Unable to save. Check dates, consent, overlapping entries and reviewer permissions. A reviewer cannot approve their own submission."}
        </p>
      )}
      {participants.data.length > 0 ? (
        <form method="get" className="panel flex flex-wrap items-end gap-4">
          <Field label="Participant">
            <select name="participant" defaultValue={selected?.id}>
              {participants.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.public_alias}
                </option>
              ))}
            </select>
          </Field>
          <SaveButton>View hours</SaveButton>
        </form>
      ) : (
        <p className="notice">
          Onboard a participant before recording training hours.
        </p>
      )}
      {totals && (
        <section
          aria-label="Reviewed training totals"
          className="grid gap-4 sm:grid-cols-3"
        >
          {[
            ["Verified workshop", totals.workshop_minutes],
            ["Verified lab", totals.lab_minutes],
            ["Pending review", totals.pending_minutes],
          ].map(([label, minutes]) => (
            <article className="panel" key={String(label)}>
              <h2 className="font-semibold">{label}</h2>
              <p className="mt-3 text-3xl font-bold">
                {(Number(minutes) / 60).toFixed(2)} h
              </p>
            </article>
          ))}
          <p className="text-sm text-muted-foreground">
            Totals do not automatically award academic credit or approve a
            level.
          </p>
        </section>
      )}
      {selected && (staff || selected.profile_id === user.id) && (
        <FormPanel title="Submit training hours">
          <form action={saveHours.bind(null, clubId)} className="space-y-4">
            <Hidden name="operation" value="submit" />
            <Hidden name="participant_id" value={selected.id} />
            <Hidden name="request_id" value={randomUUID()} />
            <Field label="Category">
              <select name="category">
                <option value="workshop">Workshop instruction</option>
                <option value="lab">Supervised lab / practical training</option>
              </select>
            </Field>
            <Field label="Department">
              <DepartmentSelect />
            </Field>
            <HourTimes />
            <Field label="Activity and evidence">
              <textarea name="evidence" maxLength={5000} required />
            </Field>
            <SaveButton>Submit hours for review</SaveButton>
          </form>
        </FormPanel>
      )}
      <section className="space-y-4">
        {selected && (
          <div className="flex flex-wrap gap-5">
            <a
              className="text-primary underline"
              href={`/workspace/${clubId}/exports/${selected.id}`}
            >
              Download participant record (CSV)
            </a>
            <a
              className="text-primary underline"
              href={`/workspace/${clubId}/exports/${selected.id}?format=pdf`}
            >
              Download Record Book (PDF)
            </a>
            <Link
              className="text-primary underline"
              href={`/workspace/${clubId}/record-book/${selected.id}`}
            >
              Open Record Book
            </Link>
          </div>
        )}
        <h2 className="text-2xl font-bold">Training history</h2>
        {!entries?.data?.length && (
          <p className="notice">No training hours recorded.</p>
        )}
        {entries?.data?.map((entry) => (
          <article key={entry.id} className="panel space-y-3">
            <h3 className="font-semibold">
              {entry.category} ·{" "}
              {
                departmentLabels[
                  entry.department_code as keyof typeof departmentLabels
                ]
              }{" "}
              · {entry.duration_minutes} minutes
            </h3>
            <p>
              <LocalDate value={entry.starts_at} /> to{" "}
              <LocalDate value={entry.ends_at} />
            </p>
            <p className="whitespace-pre-wrap">{entry.evidence}</p>
            <p className="badge">{entry.status}</p>
            {entry.feedback && (
              <p className="notice whitespace-pre-wrap">
                Reviewer feedback: {entry.feedback}
              </p>
            )}
            {staff &&
              entry.status === "pending" &&
              entry.submitted_by !== user.id &&
              selected?.profile_id !== user.id && (
                <form
                  action={saveHours.bind(null, clubId)}
                  className="space-y-4"
                >
                  <Hidden name="hours_id" value={entry.id} />
                  <Hidden name="participant_id" value={selected!.id} />
                  <Field label="Review feedback">
                    <textarea name="feedback" maxLength={2000} required />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    <Button name="decision" value="verified">
                      Verify hours
                    </Button>
                    <Button name="decision" value="rejected" variant="outline">
                      Reject entry
                    </Button>
                  </div>
                </form>
              )}
          </article>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">
        Shows up to 100 participants and 200 recent entries. Totals include all
        accessible entries. Reviewed hours cannot be overwritten.
      </p>
    </main>
  );
}
