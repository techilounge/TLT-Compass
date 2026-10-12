"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid, departments } from "@/modules/program-rules/contracts";
import { requireClub } from "@/lib/auth/session";
export async function saveHours(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db } = await requireClub(clubId);
  let notice = "validation";
  try {
    let result;
    if (form.get("operation") === "submit") {
      const i = z
        .object({
          request_id: uuid,
          participant_id: uuid,
          category: z.enum(["workshop", "lab"]),
          department: z.enum(departments),
          starts_at: z.iso.datetime(),
          ends_at: z.iso.datetime(),
          evidence: z.string().trim().min(1).max(5000),
        })
        .parse(Object.fromEntries(form));
      result = await db.rpc("submit_training_hours", {
        request_id: i.request_id,
        target_participant: i.participant_id,
        hour_category: i.category,
        department: i.department,
        starts: i.starts_at,
        ends: i.ends_at,
        hour_evidence: i.evidence,
      });
    } else {
      const i = z
        .object({
          hours_id: uuid,
          decision: z.enum(["verified", "rejected"]),
          feedback: z.string().trim().min(1).max(2000),
        })
        .parse(Object.fromEntries(form));
      result = await db.rpc("review_training_hours", {
        target_hours: i.hours_id,
        decision: i.decision,
        review_feedback: i.feedback,
      });
    }
    notice = result.error
      ? result.error.code === "42501"
        ? "permission"
        : "validation"
      : "saved";
  } catch {
    notice = "validation";
  }
  revalidatePath(`/workspace/${clubId}/hours`);
  const participant = uuid.safeParse(form.get("participant_id"));
  redirect(
    `/workspace/${clubId}/hours?notice=${notice}${participant.success ? `&participant=${participant.data}` : ""}`,
  );
}
