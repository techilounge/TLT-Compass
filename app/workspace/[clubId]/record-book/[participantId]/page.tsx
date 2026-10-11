import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import {
  departments,
  departmentLabels,
  uuid,
} from "@/modules/program-rules/contracts";
import { loadRecordRows, RecordExportError } from "@/lib/exports/record";
import { LocalDate } from "@/components/local-date";

export default async function RecordBookPage({
  params,
}: {
  params: Promise<{ clubId: string; participantId: string }>;
}) {
  const { clubId, participantId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(participantId).success)
    notFound();
  const { db, club, roles } = await requireClub(clubId);
  let rows: unknown[][];
  try {
    rows = await loadRecordRows(db, club, participantId);
  } catch (error) {
    if (error instanceof RecordExportError && error.status === 404) notFound();
    throw error;
  }
  const season = await db
    .from("seasons")
    .select("id,name,rule_set_id")
    .eq("club_id", clubId)
    .eq("id", String(rows[6][1]))
    .single();
  if (season.error) throw new Error("Unable to load season.");
  const rules = await db
    .from("program_rule_sets")
    .select("version,source_title,source_reference,status")
    .eq("club_id", clubId)
    .eq("id", season.data.rule_set_id)
    .single();
  if (rules.error) throw new Error("Unable to load rule version.");
  type Requirement = {
    id: string;
    description: string;
    department_code: string;
    level: number;
    requirement_type: string;
    source_page: string;
    source_section: string;
  };
  const requirements: Requirement[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await db
      .from("program_requirements")
      .select(
        "id,description,department_code,level,requirement_type,source_page,source_section",
        { count: "exact" },
      )
      .eq("club_id", clubId)
      .eq("rule_set_id", season.data.rule_set_id)
      .eq("level", Number(rows[5][1]))
      .order("id")
      .range(offset, offset + 499);
    if (result.error || (result.count ?? 0) > 10000)
      throw new Error("Unable to load full curriculum.");
    requirements.push(...result.data);
    if (result.data.length < 500) break;
  }
  const signed = rows.filter((r) => r[0] === "requirement_completion");
  const tasks = rows.filter((r) => r[0] === "task");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-8 px-5 py-10"
    >
      <nav aria-label="Record Book navigation" className="flex flex-wrap gap-5">
        <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
        <Link href={`/workspace/${clubId}/hours?participant=${participantId}`}>
          Training hours
        </Link>
        <Link
          href={`/workspace/${clubId}/attendance?participant=${participantId}`}
        >
          Attendance & uniform
        </Link>
      </nav>
      <header>
        <p className="eyebrow">
          {club.name} / {season.data.name}
        </p>
        <h1 className="mt-3 text-3xl font-bold">
          {String(rows[4][1])} · Record Book
        </h1>
        <p className="mt-3 text-muted-foreground">
          Level {String(rows[5][1])} · Rules {rules.data.version} (
          {rules.data.status}). Only signed reviews count as official
          completion.
        </p>
        <p className="mt-2 text-sm">
          {rules.data.source_title} ·{" "}
          {rules.data.source_reference || "Source confirmation pending"}
        </p>
      </header>
      <div className="flex flex-wrap gap-5">
        <a
          className="text-primary underline"
          href={`/workspace/${clubId}/exports/${participantId}`}
        >
          Download CSV
        </a>
        <a
          className="text-primary underline"
          href={`/workspace/${clubId}/exports/${participantId}?format=pdf`}
        >
          Download PDF Record Book
        </a>
      </div>
      {requirements.length === 0 && (
        <p className="notice">
          No requirements configured for this level and rule version. An empty
          checklist does not establish completion.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {departments.map((code) => {
          const items = requirements.filter((r) => r.department_code === code);
          const rotations = rows.filter(
            (r) => r[0] === "rotation" && r[5] === code,
          );
          return (
            <section key={code} className="panel">
              <h2 className="text-xl font-bold">{departmentLabels[code]}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {items.length} configured requirements · {rotations.length}{" "}
                rotations
              </p>
              {items.length === 0 ? (
                <p className="mt-4 text-sm">No requirements configured.</p>
              ) : (
                <ul className="mt-5 space-y-5">
                  {items.map((item) => {
                    const completion = signed.find(
                      (r) =>
                        r[15] === item.id && r[9] === season.data.rule_set_id,
                    );
                    return (
                      <li key={item.id} className="border-t border-border pt-4">
                        <p className="font-semibold">{item.description}</p>
                        <p className="mt-2 text-sm">
                          {item.requirement_type} ·{" "}
                          {completion
                            ? "Signed completion"
                            : "Awaiting signed completion"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Page {item.source_page} · {item.source_section}
                        </p>
                        {roles.some((r) =>
                          ["director", "coordinator"].includes(r),
                        ) && (
                          <Link
                            href={`/workspace/${clubId}/ai/task-proposals?participant_id=${participantId}&requirement_id=${item.id}`}
                          >
                            Suggest a supervised task
                          </Link>
                        )}
                        {completion && (
                          <p className="mt-2 text-sm">
                            Reviewed <LocalDate value={String(completion[8])} />{" "}
                            · Reviewer {String(completion[7])}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {rotations.map((r) => (
                <p key={String(r[1])} className="mt-4 text-sm">
                  Rotation {String(r[3])}–{String(r[4])}: {String(r[2])}
                </p>
              ))}
            </section>
          );
        })}
      </div>
      <section className="panel">
        <h2 className="text-xl font-bold">Task and evidence index</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Exports include version and reviewer references. Evidence and
          reflections stay in the authorized task workspace.
        </p>
        {tasks.length === 0 ? (
          <p className="mt-4">No tasks yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tasks.map((r) => (
              <li key={String(r[1])}>
                <Link
                  className="text-primary underline"
                  href={`/workspace/${clubId}?participant=${participantId}#tasks`}
                >
                  {String(r[6])}
                </Link>{" "}
                · {String(r[2])}
                <span className="block text-sm text-muted-foreground">
                  {
                    rows.filter(
                      (e) => e[0] === "evidence_index" && e[5] === r[1],
                    ).length
                  }{" "}
                  evidence versions · {String(r[1])}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
