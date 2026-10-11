"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { requirementSchema, uuid } from "@/modules/program-rules/contracts";
export async function editRequirement(
  clubId: string,
  requirementId: string,
  form: FormData,
) {
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(requirementId).success)
    redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}`);
  let notice = "saved";
  try {
    const payload = requirementSchema
      .omit({ rule_set_id: true })
      .parse(Object.fromEntries(form));
    const revision = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(form.get("revision"));
    const scoped = await db
      .from("program_requirements")
      .select("id")
      .eq("club_id", clubId)
      .eq("id", requirementId)
      .maybeSingle();
    if (scoped.error || !scoped.data) throw new Error("Scope unavailable");
    const { error } = await db.rpc("edit_draft_requirement", {
      target_requirement: requirementId,
      expected_revision: revision,
      payload,
    });
    if (error) notice = error.code === "40001" ? "stale" : "invalid";
  } catch {
    notice = "invalid";
  }
  revalidatePath(`/workspace/${clubId}`, "layout");
  redirect(`/workspace/${clubId}/curriculum/${requirementId}?notice=${notice}`);
}
