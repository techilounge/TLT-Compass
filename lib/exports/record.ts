import type { SupabaseClient } from "@supabase/supabase-js";
export class RecordExportError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function loadRecordRows(
  db: SupabaseClient,
  club: { id: string; name: string; timezone: string },
  participantId: string,
): Promise<unknown[][]> {
  const clubId = club.id;
  const participant = await db
    .from("tlt_participants")
    .select("id,public_alias,current_level,season_id")
    .eq("club_id", clubId)
    .eq("id", participantId)
    .maybeSingle();
  if (participant.error)
    throw new RecordExportError("Unable to generate record", 500);
  if (!participant.data) throw new RecordExportError("Record unavailable", 404);
  // Fetch the entire authorized record, refusing oversized exports rather than silently truncating.
  const rows: unknown[][] = [
    ["TLT Compass participant record"],
    ["Generated at (UTC)", new Date().toISOString()],
    ["Club", club.name],
    ["Program timezone", club.timezone],
    ["Participant alias", participant.data.public_alias],
    ["Level", participant.data.current_level],
    ["Season ID", participant.data.season_id],
    [
      "Section",
      "Record ID",
      "State",
      "Date/start (UTC for instants)",
      "End (UTC)",
      "Category/requirement",
      "Value",
      "Reviewer ID",
      "Reviewed at (UTC)",
      "Rule version ID",
      "Evidence/review reference",
      "Rule version",
      "Source document/reference",
      "Source page",
      "Source section",
      "Requirement ID",
    ],
  ];
  const definitions = [
    {
      table: "rotations",
      select:
        "id,status,starts_on,ends_on,department_code,mentor_assignment_id,reviewed_by,reviewed_at",
      participant: "participant_id",
    },
    {
      table: "tasks",
      select: "id,status,title,due_on,requirement_id,rule_set_id",
      participant: "participant_id",
    },
    {
      table: "training_hours",
      select:
        "id,status,starts_at,ends_at,category,department_code,duration_minutes,reviewed_by,reviewed_at",
      participant: "participant_id",
    },
    {
      table: "attendance_entries",
      select:
        "id,status,session_id,attendance,uniform_compliant,reviewed_by,reviewed_at",
      participant: "participant_id",
    },
    {
      table: "participant_requirements",
      select:
        "id,requirement_id,completed_at,reviewed_by,rule_set_id,review_id",
      participant: "participant_id",
    },
  ];
  for (const definition of definitions) {
    for (let offset = 0; offset < 10000; offset += 500) {
      const result = await db
        .from(definition.table)
        .select(definition.select, { count: "exact" })
        .eq("club_id", clubId)
        .eq(definition.participant, participantId)
        .order("id")
        .range(offset, offset + 499);
      if (result.error)
        throw new RecordExportError("Unable to generate record", 500);
      if ((result.count ?? 0) > 10000)
        throw new RecordExportError(
          "Record exceeds synchronous export limit; contact your director.",
          413,
        );
      for (const item of result.data ?? []) {
        const r = item as unknown as Record<string, unknown>;
        if (definition.table === "training_hours")
          rows.push([
            "training_hours",
            r.id,
            r.status,
            r.starts_at,
            r.ends_at,
            `${r.category} / ${r.department_code}`,
            `${r.duration_minutes} minutes`,
            r.reviewed_by,
            r.reviewed_at,
            "",
            r.id,
          ]);
        else if (definition.table === "attendance_entries")
          rows.push([
            "attendance",
            r.id,
            r.status,
            "",
            "",
            r.attendance,
            `uniform=${r.uniform_compliant ?? "not assessed"}`,
            r.reviewed_by,
            r.reviewed_at,
            "",
            r.session_id,
          ]);
        else if (definition.table === "rotations")
          rows.push([
            "rotation",
            r.id,
            r.status,
            r.starts_on,
            r.ends_on,
            r.department_code,
            "",
            r.reviewed_by,
            r.reviewed_at,
            "",
            r.mentor_assignment_id,
          ]);
        else if (definition.table === "tasks")
          rows.push([
            "task",
            r.id,
            r.status,
            r.due_on,
            "",
            r.requirement_id,
            r.title,
            "",
            "",
            r.rule_set_id,
            r.id,
          ]);
        else
          rows.push([
            "requirement_completion",
            r.id,
            "verified",
            r.completed_at,
            "",
            r.requirement_id,
            "signed completion",
            r.reviewed_by,
            r.completed_at,
            r.rule_set_id,
            r.review_id,
            "",
            "",
            "",
            "",
            r.requirement_id,
          ]);
      }
      if ((result.data?.length ?? 0) < 500) break;
    }
  }
  // Resolve provenance through the same user-scoped client; never use an elevated export client.
  const references = [
    {
      section: "attendance",
      column: 10,
      table: "attendance_sessions",
      select: "id,title,held_on",
    },
    {
      section: "requirement_completion",
      column: 5,
      table: "program_requirements",
      select: "id,description,source_page,source_section,department_code,level",
    },
    {
      section: "requirement_completion",
      column: 9,
      table: "program_rule_sets",
      select: "id,version,source_title,source_reference",
    },
  ];
  for (const reference of references) {
    const matching = rows.filter((row) => row[0] === reference.section);
    const ids = [
      ...new Set(matching.map((row) => String(row[reference.column]))),
    ];
    const metadata = new Map<string, Record<string, unknown>>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await db
        .from(reference.table)
        .select(reference.select)
        .eq("club_id", clubId)
        .in("id", ids.slice(offset, offset + 100));
      if (result.error)
        throw new RecordExportError("Unable to resolve record provenance", 500);
      for (const item of result.data ?? []) {
        const record = item as unknown as Record<string, unknown>;
        metadata.set(String(record.id), record);
      }
    }
    for (const row of matching) {
      const record = metadata.get(String(row[reference.column]));
      if (!record)
        throw new RecordExportError("Incomplete record provenance", 500);
      if (reference.table === "attendance_sessions") {
        row[3] = record.held_on;
        row[5] = `${row[5]} / ${record.title}`;
      } else if (reference.table === "program_requirements") {
        row[5] = `${record.department_code} / Level ${record.level} / ${row[5]} / ${record.description}`;
        row[13] = record.source_page;
        row[14] = record.source_section;
      } else {
        row[11] = record.version;
        row[12] = `${record.source_title} / ${record.source_reference}`;
      }
    }
  }
  const season = await db
    .from("seasons")
    .select("rule_set_id")
    .eq("club_id", clubId)
    .eq("id", participant.data.season_id)
    .single();
  if (season.error)
    throw new RecordExportError("Unable to resolve season rule version", 500);
  const rule = await db
    .from("program_rule_sets")
    .select("version,source_title,source_reference")
    .eq("club_id", clubId)
    .eq("id", season.data.rule_set_id)
    .single();
  if (rule.error)
    throw new RecordExportError("Unable to resolve program source", 500);
  const completedIds = new Set(
    rows
      .filter(
        (r) =>
          r[0] === "requirement_completion" && r[9] === season.data.rule_set_id,
      )
      .map((r) => String(r[15])),
  );
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await db
      .from("program_requirements")
      .select(
        "id,description,department_code,source_page,source_section,requirement_type",
        { count: "exact" },
      )
      .eq("club_id", clubId)
      .eq("rule_set_id", season.data.rule_set_id)
      .eq("level", participant.data.current_level)
      .order("id")
      .range(offset, offset + 499);
    if (result.error)
      throw new RecordExportError(
        "Unable to load applicable requirements",
        500,
      );
    if ((result.count ?? 0) > 10000)
      throw new RecordExportError("Curriculum exceeds export limit", 413);
    for (const item of result.data ?? [])
      rows.push([
        "applicable_requirement",
        item.id,
        completedIds.has(item.id)
          ? "signed completion"
          : "awaiting signed completion",
        "",
        "",
        `${item.department_code} / ${item.description}`,
        item.requirement_type,
        "",
        "",
        season.data.rule_set_id,
        "",
        rule.data.version,
        `${rule.data.source_title} / ${rule.data.source_reference}`,
        item.source_page,
        item.source_section,
        item.id,
      ]);
    if ((result.data?.length ?? 0) < 500) break;
  }
  const taskIds = rows
    .filter((row) => row[0] === "task")
    .map((row) => String(row[1]));
  const submissionIds: string[] = [];
  for (let chunk = 0; chunk < taskIds.length; chunk += 100) {
    for (let offset = 0; offset < 10000; offset += 500) {
      const result = await db
        .from("task_submissions")
        .select("id,task_id,version_no,activity_on,submitted_at,submitted_by", {
          count: "exact",
        })
        .eq("club_id", clubId)
        .in("task_id", taskIds.slice(chunk, chunk + 100))
        .order("id")
        .range(offset, offset + 499);
      if (result.error)
        throw new RecordExportError("Unable to load evidence index", 500);
      if (
        (result.count ?? 0) > 10000 ||
        submissionIds.length + (result.data?.length ?? 0) > 10000
      )
        throw new RecordExportError("Evidence index exceeds export limit", 413);
      for (const item of result.data ?? []) {
        submissionIds.push(item.id);
        rows.push([
          "evidence_index",
          item.id,
          `version ${item.version_no}`,
          item.activity_on,
          "",
          item.task_id,
          "text evidence and reflection held privately",
          item.submitted_by,
          item.submitted_at,
          "",
          item.id,
        ]);
      }
      if ((result.data?.length ?? 0) < 500) break;
    }
  }
  for (let offset = 0; offset < submissionIds.length; offset += 100) {
    const result = await db
      .from("task_reviews")
      .select("id,submission_id,reviewer_id,decision,reviewed_at")
      .eq("club_id", clubId)
      .in("submission_id", submissionIds.slice(offset, offset + 100));
    if (result.error)
      throw new RecordExportError("Unable to load review index", 500);
    for (const item of result.data ?? [])
      rows.push([
        "review_index",
        item.id,
        item.decision,
        "",
        "",
        item.submission_id,
        "feedback held privately",
        item.reviewer_id,
        item.reviewed_at,
        "",
        item.submission_id,
      ]);
  }
  return rows;
}
