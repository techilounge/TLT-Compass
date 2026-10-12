import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import {
  departments,
  departmentLabels,
  uuid,
} from "@/modules/program-rules/contracts";
import { Field, SaveButton } from "@/components/workspace/forms";
const metricsSchema = z.object({
  participants: z.number(),
  active: z.number(),
  pending_enrollment: z.number(),
  missing_primary_mentor: z.number(),
  tasks: z.number(),
  pending_reviews: z.number(),
  overdue_tasks: z.number(),
  verified_tasks: z.number(),
  required_total: z.number(),
  required_completed: z.number(),
  attendance_numerator: z.number(),
  attendance_denominator: z.number(),
  uniform_numerator: z.number(),
  uniform_denominator: z.number(),
  workshop_minutes: z.number(),
  lab_minutes: z.number(),
  pending_hour_reviews: z.number(),
  enrolled_by_level: z.record(z.string(), z.number()),
  mentor_caseload: z.array(
    z.object({ mentor_id: z.string(), participants: z.number() }),
  ),
});
const ratio = (n: number, d: number) =>
  d > 0 ? `${Math.round((n / d) * 100)}% (${n}/${d})` : "Not yet measured";
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    season?: string;
    level?: string;
    mentor?: string;
    department?: string;
  }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, roles } = await requireClub(clubId);
  const q = await searchParams;
  const manager = roles.includes("director") || roles.includes("coordinator"),
    staff = roles.some((r) => r !== "participant");
  const season = uuid.safeParse(q.season).success ? q.season : null;
  const mentor = uuid.safeParse(q.mentor).success ? q.mentor : null;
  const level = ["1", "2", "3", "4"].includes(q.level ?? "")
    ? Number(q.level)
    : null;
  const department = departments.find((d) => d === q.department) ?? null;
  const [summary, reminders, seasons, assignments, profiles] =
    await Promise.all([
      db.rpc("progress_dashboard", {
        target_club: clubId,
        target_season: season,
        selected_level: level,
        target_mentor: mentor,
        department,
      }),
      db.rpc("workspace_reminders", { target_club: clubId }),
      db
        .from("seasons")
        .select("id,name")
        .eq("club_id", clubId)
        .order("starts_on", { ascending: false })
        .limit(100),
      db
        .from("mentor_assignments")
        .select("mentor_profile_id")
        .eq("club_id", clubId)
        .eq("state", "active")
        .limit(500),
      db.from("profiles").select("id,display_name").limit(500),
    ]);
  if ([summary, reminders, seasons, assignments, profiles].some((r) => r.error))
    throw new Error("Unable to load dashboard.");
  const m = metricsSchema.parse(summary.data);
  const names = new Map(profiles.data!.map((p) => [p.id, p.display_name]));
  const cards = [
    ["Accessible participants", m.participants],
    ["Active enrollment", m.active],
    ["Pending enrollment", m.pending_enrollment],
    ["Missing active primary assignment", m.missing_primary_mentor],
    [
      "Signed required checklist",
      ratio(m.required_completed, m.required_total),
    ],
    [
      "Verified attendance",
      ratio(m.attendance_numerator, m.attendance_denominator),
    ],
    ["Verified uniform", ratio(m.uniform_numerator, m.uniform_denominator)],
    ["Workshop hours", (m.workshop_minutes / 60).toFixed(2)],
    ["Lab hours", (m.lab_minutes / 60).toFixed(2)],
    ["Tasks awaiting review", m.pending_reviews],
    ["Hours awaiting review", m.pending_hour_reviews],
    ["Overdue tasks", m.overdue_tasks],
  ];
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-7xl space-y-8 px-5 py-10"
    >
      <nav aria-label="Dashboard navigation" className="flex flex-wrap gap-5">
        <Link href={`/workspace/${clubId}`}>Club workspace</Link>
        <Link href={`/workspace/${clubId}/recognition`}>Recognition</Link>
        <Link href={`/workspace/${clubId}/hours`}>Training hours</Link>
        {manager && (
          <Link href={`/workspace/${clubId}/admin`}>Admin Dashboard</Link>
        )}
      </nav>
      <header>
        <p className="eyebrow">{club.name}</p>
        <h1 className="mt-3 text-3xl font-bold">
          {manager
            ? "Club progress dashboard"
            : staff
              ? "Mentor dashboard"
              : "My progress dashboard"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Live metrics from authorized records. Staff access follows active
          roles, MFA and mentor assignments. Zero denominators are not
          completion.
        </p>
      </header>
      <form method="get" className="panel flex flex-wrap items-end gap-4">
        <Field label="Season">
          <select name="season" defaultValue={season ?? ""}>
            <option value="">All seasons</option>
            {seasons.data!.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <select name="level" defaultValue={level ?? ""}>
            <option value="">All levels</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        {staff && (
          <Field label="Mentor">
            <select name="mentor" defaultValue={mentor ?? ""}>
              <option value="">All accessible assignments</option>
              {[
                ...new Set(assignments.data!.map((a) => a.mentor_profile_id)),
              ].map((id) => (
                <option value={id} key={id}>
                  {names.get(id) ?? "Assigned mentor"}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Active rotation department">
          <select name="department" defaultValue={department ?? ""}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {departmentLabels[d]}
              </option>
            ))}
          </select>
        </Field>
        <SaveButton>Apply filters</SaveButton>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <section className="panel" key={String(label)}>
            <h2 className="text-sm text-muted-foreground">{label}</h2>
            <p className="mt-3 text-2xl font-bold">{value}</p>
          </section>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Attendance and uniform include verified records only. Workshop/lab
        totals include verified minutes. Department filtering selects
        participants in an active rotation and narrows tasks, requirements and
        hours. Program dates use {club.timezone}.
      </p>
      {manager && (
        <section className="panel">
          <h2 className="text-xl font-bold">Enrollment and mentor capacity</h2>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <ul className="space-y-2">
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>
                  Level {n}: {m.enrolled_by_level[String(n)] ?? 0} enrolled
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {m.mentor_caseload.map((c) => (
                <li key={c.mentor_id}>
                  {names.get(c.mentor_id) ?? "Assigned mentor"}:{" "}
                  {c.participants} active participant assignments
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Caseload counts distinct assigned participants. These metrics
            support staffing decisions; they do not rank young people.
          </p>
        </section>
      )}
      <section className="panel">
        <h2 className="text-2xl font-bold">In-app reminders</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Up to 100 reminders across all your accessible records, independent of
          the filters above. No external messages are sent.
        </p>
        {!reminders.data?.length ? (
          <p className="mt-5">No upcoming deadlines or pending task reviews.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {reminders.data.map(
              (r: {
                task_id: string;
                participant_id: string;
                title: string;
                due_on: string | null;
                reminder: string;
              }) => (
                <li key={r.task_id} className="border-t border-border pt-4">
                  <Link
                    className="font-semibold text-primary underline"
                    href={`/workspace/${clubId}?participant=${r.participant_id}#tasks`}
                  >
                    {r.title}
                  </Link>
                  <p>
                    {r.reminder}
                    {r.due_on ? ` · ${r.due_on}` : ""}
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
