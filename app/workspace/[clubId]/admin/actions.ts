"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";

export async function updateMemberRole(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.includes("director"))
    redirect(`/workspace/${clubId}?notice=permission`);
  const input = z
    .object({
      profile_id: uuid,
      role: z.enum([
        "director",
        "coordinator",
        "primary_mentor",
        "operational_mentor",
        "participant",
      ]),
      active: z.enum(["true", "false"]),
    })
    .safeParse(Object.fromEntries(form));
  let notice = "validation";
  if (input.success) {
    const { error } = await db.rpc("set_member_role", {
      target_club: clubId,
      target_profile: input.data.profile_id,
      target_role: input.data.role,
      active: input.data.active === "true",
    });
    notice = error ? "permission" : "saved";
  }
  revalidatePath(`/workspace/${clubId}`, "layout");
  redirect(`/workspace/${clubId}/admin?notice=${notice}#members`);
}
