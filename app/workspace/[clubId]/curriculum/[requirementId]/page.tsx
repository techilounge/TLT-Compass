import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import {
  departments,
  departmentLabels,
  uuid,
} from "@/modules/program-rules/contracts";
import { Field, SaveButton } from "@/components/workspace/forms";
import { editRequirement } from "./actions";
import { LocalDate } from "@/components/local-date";
export default async function RequirementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; requirementId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId, requirementId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(requirementId).success)
    notFound();
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}`);
  const { data: req, error } = await db
    .from("program_requirements")
    .select("*")
    .eq("club_id", clubId)
    .eq("id", requirementId)
    .maybeSingle();
  if (error) throw new Error("Unable to load requirement");
  if (!req) notFound();
  const rule = await db
    .from("program_rule_sets")
    .select("version,status")
    .eq("club_id", clubId)
    .eq("id", req.rule_set_id)
    .single();
  if (rule.error) throw new Error("Unable to load rule version");
  const notice = (await searchParams).notice;
  const history = await db
    .from("requirement_draft_revisions")
    .select("id,revision,edited_at,before_value,after_value")
    .eq("club_id", clubId)
    .eq("requirement_id", requirementId)
    .order("revision", { ascending: false })
    .limit(10);
  if (history.error) throw new Error("Unable to load revision history");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}#curriculum`}>← Curriculum</Link>
      <h1>Edit curriculum requirement</h1>
      <p>
        {rule.data.version} · {rule.data.status} · revision {req.draft_revision}
      </p>
      <p>
        Draft corrections retain a revision history. Director approval remains a
        separate step. Approved requirements are frozen.
      </p>
      {notice && (
        <p role="status" className="notice">
          {notice === "saved"
            ? "Draft requirement saved."
            : notice === "stale"
              ? "Another edit was saved first. Review the latest values and try again."
              : "Unable to save. Check the fields and draft status."}
        </p>
      )}
      {rule.data.status === "draft" ? (
        <form
          action={editRequirement.bind(null, clubId, requirementId)}
          className="panel space-y-4"
        >
          <input type="hidden" name="revision" value={req.draft_revision} />
          <Field label="Level">
            <input
              name="level"
              type="number"
              min={1}
              max={4}
              required
              defaultValue={req.level}
            />
          </Field>
          <Field label="Department">
            <select name="department_code" defaultValue={req.department_code}>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {departmentLabels[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Requirement type">
            <select name="requirement_type" defaultValue={req.requirement_type}>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              required
              maxLength={2000}
              defaultValue={req.description}
            />
          </Field>
          <Field label="Source page">
            <input
              name="source_page"
              required
              maxLength={80}
              defaultValue={req.source_page}
            />
          </Field>
          <Field label="Source section">
            <input
              name="source_section"
              required
              maxLength={200}
              defaultValue={req.source_section}
            />
          </Field>
          <SaveButton>Save draft correction</SaveButton>
        </form>
      ) : (
        <p className="notice">
          Create a new draft rule version to revise approved curriculum.
        </p>
      )}
      <section className="space-y-4">
        <h2>Recent draft revisions</h2>
        <p>
          Showing the latest ten corrections. Earlier revisions remain retained.
        </p>
        {history.data.map((entry) => (
          <details key={entry.id} className="panel">
            <summary>
              Revision {entry.revision} · <LocalDate value={entry.edited_at} />
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              {(
                [
                  ["level", "Level"],
                  ["department_code", "Department"],
                  ["requirement_type", "Type"],
                  ["description", "Description"],
                  ["source_page", "Source page"],
                  ["source_section", "Source section"],
                ] as const
              )
                .filter(
                  ([key]) => entry.before_value[key] !== entry.after_value[key],
                )
                .map(([key, label]) => (
                  <div key={key}>
                    <p className="font-semibold">{label}</p>
                    <p className="break-words">
                      Before: {String(entry.before_value[key])}
                    </p>
                    <p className="break-words">
                      After: {String(entry.after_value[key])}
                    </p>
                  </div>
                ))}
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
