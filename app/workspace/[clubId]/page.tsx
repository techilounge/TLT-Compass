import Link from "next/link";
import { LocalDate } from "@/components/local-date";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { ClubSetup } from "@/components/workspace/setup";
import {
  Field,
  FormPanel,
  SaveButton,
  Hidden,
} from "@/components/workspace/forms";
import {
  ParticipantCard,
  type MentorRow,
} from "@/components/workspace/participant-card";
import {
  TaskCard,
  type TaskRow,
  type SubmissionRow,
  type ReviewRow,
} from "@/components/workspace/task-card";
import {
  uuid,
  departmentLabels,
  type ParticipantRecord,
  type RuleRecord,
} from "@/modules/program-rules/contracts";
import { createParticipant, assignTask, reviewRotation } from "./actions";
type Season = { id: string; name: string; rule_set_id: string };
type Requirement = {
  id: string;
  rule_set_id: string;
  level: number;
  department_code: keyof typeof departmentLabels;
  requirement_type: string;
  description: string;
  source_page: string;
  source_section: string;
};
type Completion = {
  id: string;
  participant_id: string;
  requirement_id: string;
  rule_set_id: string;
  reviewed_by: string;
  completed_at: string;
};
type Rotation = {
  id: string;
  participant_id: string;
  department_code: keyof typeof departmentLabels;
  starts_on: string;
  ends_on: string;
  status: string;
};
const notices: Record<string, string> = {
  saved: "Your changes were saved.",
  permission: "Your role or assignment does not permit this action.",
  duplicate:
    "This record or review already exists. Refresh before trying again.",
  validation:
    "Unable to save. Check required fields, task status, mentor eligibility, and approved program rules.",
};
export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    notice?: string;
    page?: string;
    participant?: string;
  }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1),
  );
  const selected = uuid.safeParse(query.participant).success
    ? query.participant
    : undefined;
  const { db, user, club, roles } = await requireClub(clubId);
  const isDirector = roles.includes("director"),
    isManager = isDirector || roles.includes("coordinator"),
    isStaff = roles.some((r) => r !== "participant");
  let roster = db
    .from("tlt_participants")
    .select("*", { count: "exact" })
    .eq("club_id", clubId)
    .order("public_alias")
    .order("id");
  let taskQuery = db
    .from("tasks")
    .select(
      "id,participant_id,requirement_id,title,instructions,due_on,status",
      { count: "exact" },
    )
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .order("id");
  if (selected) {
    roster = roster.eq("id", selected);
    taskQuery = taskQuery.eq("participant_id", selected);
  }
  const results = await Promise.all([
    roster.range((page - 1) * 20, page * 20 - 1),
    taskQuery.range((page - 1) * 20, page * 20 - 1),
    db
      .from("program_rule_sets")
      .select("*")
      .eq("club_id", clubId)
      .order("version")
      .limit(100),
    db
      .from("seasons")
      .select("id,name,rule_set_id")
      .eq("club_id", clubId)
      .order("starts_on", { ascending: false })
      .limit(100),
    db
      .from("program_requirements")
      .select(
        "id,rule_set_id,level,department_code,requirement_type,description,source_page,source_section",
      )
      .eq("club_id", clubId)
      .order("level")
      .limit(500),
    db
      .from("mentor_assignments")
      .select("id,participant_id,mentor_profile_id,assignment_type,state")
      .eq("club_id", clubId)
      .eq("state", "active")
      .limit(500),
    db
      .from("club_memberships")
      .select("profile_id,role")
      .eq("club_id", clubId)
      .eq("status", "active")
      .limit(500),
    db.from("profiles").select("id,display_name").limit(500),
    db
      .from("rotations")
      .select("id,participant_id,department_code,starts_on,ends_on,status")
      .eq("club_id", clubId)
      .order("starts_on", { ascending: false })
      .limit(100),
  ]);
  if (results.some((r) => r.error))
    throw new Error("Unable to load club records.");
  const participants = results[0].data as ParticipantRecord[],
    tasks = results[1].data as TaskRow[],
    rules = results[2].data as RuleRecord[],
    seasons = results[3].data as Season[],
    requirements = results[4].data as Requirement[],
    mentors = results[5].data as MentorRow[],
    memberships = results[6].data as { profile_id: string; role: string }[],
    profiles = results[7].data as { id: string; display_name: string }[],
    rotations = results[8].data as Rotation[];
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  const [submissionResult, completionResult] = await Promise.all([
    db
      .from("task_submissions")
      .select("id,task_id,version_no,evidence_text,reflection,activity_on")
      .eq("club_id", clubId)
      .in(
        "task_id",
        tasks.map((t) => t.id),
      )
      .order("version_no", { ascending: false })
      .limit(500),
    db
      .from("participant_requirements")
      .select(
        "id,participant_id,requirement_id,rule_set_id,reviewed_by,completed_at",
      )
      .eq("club_id", clubId)
      .in(
        "participant_id",
        participants.map((p) => p.id),
      )
      .limit(500),
  ]);
  if (submissionResult.error || completionResult.error)
    throw new Error("Unable to load evidence.");
  const submissions = submissionResult.data as SubmissionRow[],
    completions = completionResult.data as Completion[];
  const reviewResult = await db
    .from("task_reviews")
    .select("submission_id,decision,feedback")
    .eq("club_id", clubId)
    .in(
      "submission_id",
      submissions.map((s) => s.id),
    )
    .limit(500);
  if (reviewResult.error) throw new Error("Unable to load review feedback.");
  const reviews = reviewResult.data as ReviewRow[];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: club.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const adultOptions = [
    ...new Set(
      memberships
        .filter((m) => m.role !== "participant")
        .map((m) => m.profile_id),
    ),
  ];
  const total = Math.max(results[0].count ?? 0, results[1].count ?? 0);
  const pageHref = (n: number) =>
    `/workspace/${clubId}?page=${n}${selected ? `&participant=${selected}` : ""}`;
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-6">
        <Link href="/workspace" className="font-bold">
          ✦ TLT Compass
        </Link>
        <Link
          href="/account/security"
          className="min-h-11 py-3 text-sm text-primary"
        >
          Account security
        </Link>
      </header>
      <div className="workspace-layout">
        <aside>
          <nav aria-label="Club navigation" className="club-nav">
            {isManager && (
              <Link href={`/workspace/${clubId}/admin`}>Admin Dashboard</Link>
            )}
            <a href="#overview">Overview</a>
            <Link href={`/workspace/${clubId}/dashboard`}>
              Progress dashboard
            </Link>
            <a href="#roster">Record Book</a>
            <Link href={`/workspace/${clubId}/attendance`}>
              Attendance & uniform
            </Link>
            <a href="#tasks">Tasks & reviews</a>
            <Link href={`/workspace/${clubId}/hours`}>
              Workshop & lab hours
            </Link>
            <a href="#curriculum">Curriculum</a>
            {isManager && (
              <Link href={`/workspace/${clubId}/curriculum/catalog`}>
                Curriculum catalog
              </Link>
            )}
            <Link href={`/workspace/${clubId}/calendar`}>Calendar</Link>
            <Link href={`/workspace/${clubId}/games`}>Games</Link>
            <Link href={`/workspace/${clubId}/notifications`}>
              Notifications
            </Link>
            {roles.some((r) =>
              [
                "director",
                "coordinator",
                "primary_mentor",
                "operational_mentor",
              ].includes(r),
            ) && <Link href={`/workspace/${clubId}/ai`}>AI Integration</Link>}
            <Link href={`/workspace/${clubId}/recognition`}>
              Recognition & leaderboard
            </Link>
            {isManager && <a href="#setup">Program setup</a>}
          </nav>
          <p className="mt-6 text-xs text-muted-foreground">{club.timezone}</p>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 space-y-12 pb-16">
          <section id="overview">
            <p className="eyebrow">
              {isDirector ? "Director workspace" : "Your leadership journey"}
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{club.name}</h1>
            <p className="mt-4 text-muted-foreground">
              Training, service, and mentorship connected through a documented
              Record Book.
            </p>
            {query.notice && notices[query.notice] && (
              <p role="status" className="notice mt-6">
                {notices[query.notice]}
              </p>
            )}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ["Accessible participant records", results[0].count ?? 0],
                ["Accessible tasks", results[1].count ?? 0],
                ["Program rule versions", rules.length],
              ].map(([label, count]) => (
                <div className="panel" key={label}>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-3 text-3xl font-bold">{count}</p>
                </div>
              ))}
            </div>
          </section>
          <section id="roster" className="space-y-5 scroll-mt-6">
            <h2 className="text-2xl font-bold">Record Book</h2>
            {selected && (
              <Link
                href={`/workspace/${clubId}#roster`}
                className="block text-sm text-primary"
              >
                Show all records
              </Link>
            )}
            {isManager && seasons.length > 0 && (
              <FormPanel title="Add a participant">
                <form
                  action={createParticipant.bind(null, clubId)}
                  className="form-grid"
                >
                  <Field label="Public alias">
                    <input name="public_alias" maxLength={80} required />
                  </Field>
                  <Field label="Grade">
                    <input
                      name="grade_level"
                      type="number"
                      min={1}
                      max={12}
                      required
                    />
                  </Field>
                  <Field label="Season">
                    <select name="season_id">
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Existing participant account (optional)">
                    <select name="profile_id">
                      <option value="">No login linked</option>
                      {memberships
                        .filter((m) => m.role === "participant")
                        .map((m) => (
                          <option key={m.profile_id} value={m.profile_id}>
                            {names.get(m.profile_id) ?? "Participant account"}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <SaveButton>Add participant</SaveButton>
                </form>
              </FormPanel>
            )}
            {!participants.length && (
              <p className="notice">
                No records available.{" "}
                {isManager
                  ? "Create a version and season, then add your first participant."
                  : "Your director will confirm your record or mentor assignment."}
              </p>
            )}
            {participants.map((p) => {
              const rule = rules.find(
                (r) =>
                  r.id ===
                  seasons.find((s) => s.id === p.season_id)?.rule_set_id,
              );
              const signed = completions.filter(
                (c) => c.participant_id === p.id,
              );
              const required = requirements.filter(
                (r) =>
                  r.rule_set_id === rule?.id &&
                  r.level === p.current_level &&
                  r.requirement_type === "required",
              );
              return (
                <ParticipantCard
                  key={p.id}
                  clubId={clubId}
                  participant={p}
                  rule={rule}
                  mentors={mentors}
                  adultOptions={adultOptions}
                  names={names}
                  isManager={isManager}
                  isDirector={isDirector}
                  today={today}
                >
                  <p className="text-sm text-muted-foreground">
                    Required checklist:{" "}
                    {
                      required.filter((r) =>
                        signed.some((c) => c.requirement_id === r.id),
                      ).length
                    }
                    /{required.length} verified. Promotion requires a separate
                    director review.
                  </p>
                  {signed.map((c) => (
                    <p className="notice text-sm" key={c.id}>
                      {requirements.find((r) => r.id === c.requirement_id)
                        ?.description ?? "Requirement"}
                      <br />
                      Reviewed by{" "}
                      {names.get(c.reviewed_by) ?? "Authorized adult"} ·{" "}
                      <LocalDate value={c.completed_at} />
                      <br />
                      Version{" "}
                      {rules.find((r) => r.id === c.rule_set_id)?.version ??
                        c.rule_set_id}
                    </p>
                  ))}
                  {rotations
                    .filter((r) => r.participant_id === p.id)
                    .map((r) => (
                      <div className="notice text-sm" key={r.id}>
                        <p>
                          {departmentLabels[r.department_code]} · {r.starts_on}{" "}
                          to {r.ends_on} · {r.status}
                        </p>
                        {r.status === "active" &&
                          rotations.some(
                            (other) =>
                              other.id !== r.id &&
                              other.participant_id === p.id &&
                              other.status === "active" &&
                              other.starts_on <= r.ends_on &&
                              other.ends_on >= r.starts_on,
                          ) && (
                            <p className="mt-2 font-bold">
                              Overlapping dates — review this plan with the
                              director.
                            </p>
                          )}
                        {isStaff && r.status === "active" && (
                          <form
                            action={reviewRotation.bind(null, clubId)}
                            className="mt-3"
                          >
                            <Hidden name="rotation_id" value={r.id} />
                            <SaveButton>Record rotation review</SaveButton>
                          </form>
                        )}
                      </div>
                    ))}
                </ParticipantCard>
              );
            })}
          </section>
          <section id="tasks" className="space-y-5 scroll-mt-6">
            <h2 className="text-2xl font-bold">Tasks & mentor reviews</h2>
            {isStaff && participants.some((p) => p.status === "active") && (
              <FormPanel title="Assign a requirement task">
                <form
                  action={assignTask.bind(null, clubId)}
                  className="form-grid"
                >
                  <Field label="Participant">
                    <select name="participant_id">
                      {participants
                        .filter((p) => p.status === "active")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.public_alias} · L{p.current_level}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Requirement">
                    <select name="requirement_id">
                      {requirements
                        .filter((r) =>
                          rules.some(
                            (v) =>
                              v.id === r.rule_set_id && v.status === "approved",
                          ),
                        )
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            L{r.level} · {r.description}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Task title">
                    <input name="title" maxLength={160} required />
                  </Field>
                  <Field label="Instructions">
                    <textarea name="instructions" maxLength={5000} />
                  </Field>
                  <Field label="Due date (optional)">
                    <input name="due_on" type="date" />
                  </Field>
                  <p className="text-sm text-muted-foreground">
                    The requirement must match the participant’s season, level,
                    and approved version.
                  </p>
                  <Field label="Create as">
                    <select name="creation_mode">
                      <option value="assigned">Assigned task</option>
                      <option value="draft">Staff draft</option>
                    </select>
                  </Field>
                  <SaveButton>Create task</SaveButton>
                </form>
              </FormPanel>
            )}
            {!tasks.length && (
              <p className="notice">
                No tasks yet. Tasks follow onboarding and an approved
                requirement assignment.
              </p>
            )}
            {tasks.map((t) => {
              const p = participants.find((p) => p.id === t.participant_id);
              return (
                <TaskCard
                  key={t.id}
                  clubId={clubId}
                  task={t}
                  alias={p?.public_alias ?? "Assigned participant"}
                  own={p?.profile_id === user.id}
                  isStaff={isStaff}
                  submissions={submissions}
                  reviews={reviews}
                  today={today}
                />
              );
            })}
          </section>
          <nav
            aria-label="Record pagination"
            className="flex flex-wrap items-center gap-5"
          >
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="py-3 text-primary">
                ← Previous
              </Link>
            )}
            <p className="text-sm text-muted-foreground">
              Page {page} · up to 20 records and tasks per page
            </p>
            {total > page * 20 && (
              <Link href={pageHref(page + 1)} className="py-3 text-primary">
                Next →
              </Link>
            )}
          </nav>
          <section id="curriculum" className="space-y-5 scroll-mt-6">
            <h2 className="text-2xl font-bold">Versioned curriculum</h2>
            {!rules.length && (
              <p className="notice">
                No curriculum configured. Add documented requirements and
                request director approval.
              </p>
            )}
            {rules.map((r) => (
              <details key={r.id} className="panel">
                <summary className="py-2 cursor-pointer font-semibold">
                  {r.version} · {r.status}
                </summary>
                <p className="mt-4 text-sm text-muted-foreground">
                  {r.source_title}
                  <br />
                  {r.source_reference || "Source verification pending"}
                </p>
                <ul className="mt-4 space-y-3">
                  {requirements
                    .filter((req) => req.rule_set_id === r.id)
                    .map((req) => (
                      <li key={req.id} className="notice text-sm">
                        Level {req.level} ·{" "}
                        {departmentLabels[req.department_code]} ·{" "}
                        {req.requirement_type}
                        <p className="mt-2">{req.description}</p>
                        <p className="mt-2 text-xs">
                          {req.source_section}, page {req.source_page}
                        </p>
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </section>
          {isManager && (
            <ClubSetup
              clubId={clubId}
              clubName={club.name}
              timezone={club.timezone}
              rules={rules}
              isDirector={isDirector}
            />
          )}
        </main>
      </div>
    </div>
  );
}
