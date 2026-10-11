"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { departments, uuid } from "@/modules/program-rules/contracts";
import {
  catalogVersion,
  referenceCatalog,
} from "@/modules/program-rules/reference-catalog";
export async function importCatalog(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}`);
  let notice = "validation";
  try {
    if (form.get("confirmed") !== "on") throw new Error();
    const rule = uuid.parse(form.get("rule_set_id")),
      level = z.coerce.number().int().min(1).max(4).parse(form.get("level")),
      department = z.enum(departments).parse(form.get("department_code"));
    const result = await db.rpc("import_requirement_catalog", {
      target_club: clubId,
      target_rule: rule,
      target_level: level,
      target_department: department,
      catalog_version: catalogVersion,
      items: referenceCatalog.filter((r) => r.department_code === department),
    });
    if (result.error) throw new Error();
    notice = result.data === 0 ? "existing" : "imported";
  } catch {
    /* Generic validation notice; no private data logged. */
  }
  revalidatePath(`/workspace/${clubId}`, "layout");
  redirect(`/workspace/${clubId}/curriculum/catalog?notice=${notice}`);
}
