import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import {
  departments,
  departmentLabels,
  uuid,
} from "@/modules/program-rules/contracts";
import {
  catalogVersion,
  referenceCatalog,
} from "@/modules/program-rules/reference-catalog";
import { Field, SaveButton } from "@/components/workspace/forms";
import { importCatalog } from "./actions";
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}`);
  const drafts = await db
    .from("program_rule_sets")
    .select("id,version,source_title")
    .eq("club_id", clubId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(100);
  if (drafts.error) throw new Error("Unable to load draft versions");
  const notice = (await searchParams).notice;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/admin`}>← Admin Dashboard</Link>
      <h1>Referenced curriculum catalog</h1>
      <p>
        122 concise task summaries from the supplied TLT Record Book, PDF pages
        12–19. Required/optional markings follow that edition. Publication date
        and current conference applicability remain unconfirmed. Read the
        original manual alongside these summaries; they are draft starting
        points for director review.
      </p>
      <p>
        Choose the department and level explicitly. No department is
        automatically required at every level. Special Operations and local
        interpretation need mentor/conference review. Importing never approves a
        rule version or completes a participant requirement.
      </p>
      {notice && (
        <p role="status">
          {notice === "imported"
            ? "Catalog copied into the selected draft version."
            : notice === "existing"
              ? "This catalog department and level were already imported."
              : "Import could not complete. Choose a draft and confirm review."}
        </p>
      )}
      <form
        action={importCatalog.bind(null, clubId)}
        className="panel grid gap-4 md:grid-cols-2"
      >
        <Field label="Draft rule version">
          <select name="rule_set_id" required>
            <option value="">Choose a draft</option>
            {(drafts.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.version} · {d.source_title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level for this department">
          <select name="level" required>
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Department to copy">
          <select name="department_code">
            {departments.map((d) => (
              <option key={d} value={d}>
                {departmentLabels[d]}
              </option>
            ))}
          </select>
        </Field>
        <label>
          <input type="checkbox" name="confirmed" required /> I reviewed the
          source and understand these remain draft requirements.
        </label>
        <SaveButton>Import selected department as draft</SaveButton>
      </form>
      <p>
        Catalog version: {catalogVersion}. Create a draft rule version in
        Program setup if none is listed.
      </p>
      {departments.map((d) => (
        <details key={d} className="panel">
          <summary>
            {departmentLabels[d]} ·{" "}
            {referenceCatalog.filter((r) => r.department_code === d).length}{" "}
            entries
          </summary>
          <ul>
            {referenceCatalog
              .filter((r) => r.department_code === d)
              .map((r) => (
                <li key={r.source_section} className="border-b py-3">
                  <strong>{r.requirement_type}</strong> · {r.description}
                  <br />
                  <small>
                    {r.source_page} · {r.source_section}
                  </small>
                </li>
              ))}
          </ul>
        </details>
      ))}
    </main>
  );
}
