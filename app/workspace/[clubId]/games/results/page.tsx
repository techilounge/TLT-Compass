import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { gameModes } from "@/modules/games/questions";
import { Field, Hidden, SaveButton } from "@/components/workspace/forms";
import { saveGameResult } from "./actions";
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, roles } = await requireClub(clubId),
    staff = roles.some((r) =>
      [
        "director",
        "coordinator",
        "primary_mentor",
        "operational_mentor",
      ].includes(r),
    );
  const [sessions, participants, scores, seasons] = await Promise.all([
    db
      .from("game_sessions")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("tlt_participants")
      .select("id,public_alias,status,consent_state")
      .eq("club_id", clubId)
      .limit(100),
    db
      .from("game_scores")
      .select("*")
      .eq("club_id", clubId)
      .order("submitted_at", { ascending: false })
      .limit(500),
    staff
      ? db.from("seasons").select("id,name").eq("club_id", clubId).limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if ([sessions, participants, scores, seasons].some((r) => r.error))
    throw new Error("Unable to load game results");
  const action = saveGameResult.bind(null, clubId),
    names = new Map(
      (participants.data ?? []).map((p) => [p.id, p.public_alias]),
    );
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/games`}>← Games</Link>
      <h1>Supervised sessions & results</h1>
      <p>
        Manual or SabiQuiz-reported results remain pending until an authorized
        adult reviews them. No points, official requirements or promotions are
        awarded automatically. Use a non-sensitive result reference; exclude
        contact details and private notes.
      </p>
      {(await searchParams).notice && (
        <p role="status">
          {(await searchParams).notice === "saved"
            ? "Saved."
            : "Check session, participant, attempt limits and review permission."}
        </p>
      )}
      {staff && (
        <details className="panel">
          <summary>Create supervised session</summary>
          <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
            <Hidden name="operation" value="session" />
            <Field label="Season">
              <select name="season_id" required>
                {(seasons.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Session title">
              <input name="title" maxLength={160} required />
            </Field>
            <Field label="Activity mode">
              <select name="mode">
                {gameModes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value="custom">Custom supervised activity</option>
              </select>
            </Field>
            <Field label="Session instructions">
              <textarea name="instructions" maxLength={4000} required />
            </Field>
            <Field label="Maximum score">
              <input
                name="maximum_score"
                type="number"
                min={1}
                max={100000}
                defaultValue={100}
                required
              />
            </Field>
            <Field label="Maximum attempts per participant">
              <input
                name="maximum_attempts"
                type="number"
                min={1}
                max={10}
                defaultValue={1}
                required
              />
            </Field>
            <SaveButton>Create session</SaveButton>
          </form>
        </details>
      )}
      <form action={action} className="panel grid gap-4 md:grid-cols-2">
        <Hidden name="operation" value="score" />
        <Hidden name="request_id" value={randomUUID()} />
        <Field label="Open session">
          <select name="session_id" required>
            {(sessions.data ?? [])
              .filter((s) => s.status === "open")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · maximum {s.maximum_score}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Participant">
          <select name="participant_id" required>
            {(participants.data ?? [])
              .filter(
                (p) => p.status === "active" && p.consent_state === "confirmed",
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.public_alias}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Reported score">
          <input name="score" type="number" min={0} max={100000} required />
        </Field>
        <Field label="Score source">
          <select name="source_kind">
            <option value="manual">Supervised manual result</option>
            <option value="sabiquiz_manual">SabiQuiz manual record</option>
          </select>
        </Field>
        <Field label="Result reference">
          <input name="source_reference" maxLength={500} required />
        </Field>
        <SaveButton>Submit for adult review</SaveButton>
      </form>
      <section className="space-y-4">
        <h2>Latest sessions</h2>
        {(sessions.data ?? []).map((s) => (
          <details key={s.id} className="panel">
            <summary>
              {s.title} · {s.mode} · {s.status}
            </summary>
            <p>{s.instructions}</p>
            <p>
              Maximum {s.maximum_score}; {s.maximum_attempts} attempt(s)
            </p>
            {staff && s.status === "open" && (
              <form action={action}>
                <Hidden name="operation" value="close" />
                <Hidden name="session_id" value={s.id} />
                <SaveButton>Close session to new scores</SaveButton>
              </form>
            )}
          </details>
        ))}
      </section>
      <section className="space-y-4">
        <h2>Accessible result reviews</h2>
        <p>
          Up to 100 sessions and participants, and the latest 500 accessible
          results.
        </p>
        {(scores.data ?? []).map((s) => (
          <section key={s.id} className="panel">
            <h3>
              {names.get(s.participant_id) ?? "Participant"} · {s.score} ·{" "}
              {s.status}
            </h3>
            <p>
              {s.source_kind} · {s.source_reference}
            </p>
            {s.review_note && <p>Review: {s.review_note}</p>}
            {staff && s.status === "pending" && (
              <form action={action} className="grid gap-4">
                <Hidden name="operation" value="review" />
                <Hidden name="score_id" value={s.id} />
                <Field label="Review decision">
                  <select name="decision">
                    <option value="verified">Verify result</option>
                    <option value="rejected">Reject result</option>
                  </select>
                </Field>
                <Field label="Review note shared with participant">
                  <textarea name="feedback" maxLength={1000} required />
                </Field>
                <SaveButton>Record adult review</SaveButton>
              </form>
            )}
          </section>
        ))}
      </section>
    </main>
  );
}
