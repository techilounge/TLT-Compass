import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import {
  Field,
  FormPanel,
  Hidden,
  SaveButton,
} from "@/components/workspace/forms";
import { LocalDate } from "@/components/local-date";
import { saveAttendance } from "./actions";

type Summary = {
  reviewed_entries: number;
  pending_entries: number;
  attended: number;
  attendance_denominator: number;
  uniform_compliant: number;
  uniform_denominator: number;
};
function percentage(n: number, d: number) {
  return Number(d) > 0
    ? `${Math.round((Number(n) / Number(d)) * 1000) / 10}%`
    : "Not yet measured";
}
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ participant?: string; notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, roles, user } = await requireClub(clubId);
  const query = await searchParams;
  const manager = roles.some((r) => ["director", "coordinator"].includes(r));
  const [participants, seasons, sessions] = await Promise.all([
    db
      .from("tlt_participants")
      .select("id,public_alias,profile_id,season_id")
      .eq("club_id", clubId)
      .order("public_alias")
      .limit(100),
    db
      .from("seasons")
      .select("id,name")
      .eq("club_id", clubId)
      .order("starts_on", { ascending: false })
      .limit(100),
    db
      .from("attendance_sessions")
      .select(
        "id,title,held_on,season_id,attendance_required,uniform_required,excused_counts_absent,uniform_denominator",
      )
      .eq("club_id", clubId)
      .order("held_on", { ascending: false })
      .limit(100),
  ]);
  if ([participants, seasons, sessions].some((r) => r.error))
    throw new Error("Unable to load attendance.");
  const selected = query.participant
    ? participants.data!.find((p) => p.id === query.participant)
    : participants.data![0];
  if (query.participant && !selected) notFound();
  const entries = selected
    ? await db
        .from("attendance_entries")
        .select(
          "id,session_id,attendance,uniform_compliant,status,recorded_at,reviewed_at",
        )
        .eq("club_id", clubId)
        .eq("participant_id", selected.id)
        .order("recorded_at", { ascending: false })
        .limit(500)
    : null;
  const summary = selected
    ? await db.rpc("attendance_summary", { target_participant: selected.id })
    : null;
  if (entries?.error || summary?.error)
    throw new Error("Unable to load attendance records.");
  const totals = summary?.data?.[0] as Summary | undefined;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-8 px-5 py-10"
    >
      <nav aria-label="Attendance navigation" className="flex flex-wrap gap-5">
        <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
        {manager && (
          <Link href={`/workspace/${clubId}/admin`}>Admin Dashboard</Link>
        )}
      </nav>
      <header>
        <p className="eyebrow">{club.name}</p>
        <h1 className="mt-3 text-3xl font-bold">Attendance & uniform</h1>
        <p className="mt-3 text-muted-foreground">
          Separate measures based on director-reviewed entries. Missing records
          are not treated as absences. Session dates use {club.timezone}.
        </p>
      </header>
      {query.notice && (
        <p role="status" className="notice">
          {query.notice === "saved"
            ? "Attendance changes saved."
            : "Unable to save. Check the session, season, consent, required uniform assessment and review permissions. Refresh before retrying a changed record."}
        </p>
      )}
      {manager && seasons.data!.length > 0 && (
        <FormPanel title="Create attendance session">
          <form
            action={saveAttendance.bind(null, clubId)}
            className="form-grid"
          >
            <Hidden name="operation" value="session" />
            <Field label="Season">
              <select name="season_id">
                {seasons.data!.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Session title">
              <input name="title" maxLength={160} required />
            </Field>
            <Field label="Session date">
              <input name="held_on" type="date" required />
            </Field>
            <label className="check-label">
              <input
                name="attendance_required"
                type="checkbox"
                defaultChecked
              />
              Include in attendance measure
            </label>
            <label className="check-label">
              <input name="uniform_required" type="checkbox" defaultChecked />
              Uniform required
            </label>
            <label className="check-label">
              <input name="excused_counts_absent" type="checkbox" />
              Count excused absence in the denominator
            </label>
            <Field label="Uniform measure">
              <select name="uniform_basis">
                <option value="present_only">Present participants only</option>
                <option value="all_required">
                  All required participants, subject to excused policy
                </option>
              </select>
            </Field>
            <SaveButton>Create session</SaveButton>
          </form>
        </FormPanel>
      )}
      {participants.data!.length === 0 ? (
        <p className="notice">
          Create a season and onboard participants before recording attendance.
        </p>
      ) : (
        <form method="get" className="panel flex flex-wrap items-end gap-4">
          <Field label="Participant">
            <select name="participant" defaultValue={selected?.id}>
              {participants.data!.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.public_alias}
                </option>
              ))}
            </select>
          </Field>
          <SaveButton>View records</SaveButton>
        </form>
      )}
      {totals && (
        <section
          aria-label="Reviewed attendance measures"
          className="grid gap-4 sm:grid-cols-2"
        >
          <article className="panel">
            <h2 className="font-semibold">Attendance</h2>
            <p className="mt-3 text-3xl font-bold">
              {percentage(totals.attended, totals.attendance_denominator)}
            </p>
            <p className="mt-2">
              {totals.attended}/{totals.attendance_denominator} reviewed
              required sessions
            </p>
          </article>
          <article className="panel">
            <h2 className="font-semibold">Uniform compliance</h2>
            <p className="mt-3 text-3xl font-bold">
              {percentage(totals.uniform_compliant, totals.uniform_denominator)}
            </p>
            <p className="mt-2">
              {totals.uniform_compliant}/{totals.uniform_denominator} reviewed
              assessments
            </p>
          </article>
          <p className="text-sm text-muted-foreground">
            {totals.pending_entries} pending entries. These measures do not
            automatically approve eligibility or level completion.
          </p>
        </section>
      )}
      {selected &&
        manager &&
        sessions.data!.some((s) => s.season_id === selected.season_id) && (
          <FormPanel
            title={`Record or correct attendance for ${selected.public_alias}`}
          >
            <form
              action={saveAttendance.bind(null, clubId)}
              className="form-grid"
            >
              <Hidden name="operation" value="record" />
              <Hidden name="participant_id" value={selected.id} />
              <Field label="Session">
                <select name="session_id">
                  {sessions
                    .data!.filter((s) => s.season_id === selected.season_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.held_on} · {s.title}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Attendance">
                <select name="attendance">
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </Field>
              <Field label="Uniform assessment">
                <select name="uniform">
                  <option value="not_assessed">
                    Not assessed / not applicable
                  </option>
                  <option value="yes">Compliant (present only)</option>
                  <option value="no">Not compliant</option>
                </select>
              </Field>
              <p className="text-sm text-muted-foreground">
                Corrections return the entry to pending review. Director
                verification is required before it affects measures.
              </p>
              <SaveButton>Save attendance entry</SaveButton>
            </form>
          </FormPanel>
        )}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Recent entries</h2>
        {!entries?.data?.length && (
          <p className="notice">No entries recorded for this participant.</p>
        )}
        {entries?.data?.map((entry) => {
          const session = sessions.data!.find((s) => s.id === entry.session_id);
          return (
            <article className="panel space-y-3" key={entry.id}>
              <h3 className="font-semibold">
                {session?.title ?? "Earlier session"} · {session?.held_on}
              </h3>
              <p>
                {entry.attendance} · Uniform:{" "}
                {entry.uniform_compliant === null
                  ? "not assessed"
                  : entry.uniform_compliant
                    ? "compliant"
                    : "not compliant"}{" "}
                · {entry.status}
              </p>
              <p className="text-sm text-muted-foreground">
                Recorded <LocalDate value={entry.recorded_at} />
              </p>
              {roles.includes("director") &&
                entry.status === "pending" &&
                selected?.profile_id !== user.id && (
                  <form action={saveAttendance.bind(null, clubId)}>
                    <Hidden name="operation" value="verify" />
                    <Hidden name="entry_id" value={entry.id} />
                    <Hidden name="recorded_at" value={entry.recorded_at} />
                    <Hidden name="participant_id" value={selected!.id} />
                    <SaveButton>Verify attendance entry</SaveButton>
                  </form>
                )}
            </article>
          );
        })}
      </section>
      <p className="text-xs text-muted-foreground">
        Shows up to 100 participants, 100 recent sessions and 500 recent
        entries. Measures include all accessible reviewed entries.
      </p>
    </main>
  );
}
