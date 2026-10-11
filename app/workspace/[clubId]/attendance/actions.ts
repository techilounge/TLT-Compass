"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireClub } from "@/lib/auth/session";
import { uuid, dateOnly } from "@/modules/program-rules/contracts";

export async function saveAttendance(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}?notice=permission`);
  let notice = "validation";
  try {
    const operation = form.get("operation");
    let result;
    if (operation === "session") {
      const input = z
        .object({
          season_id: uuid,
          title: z.string().trim().min(1).max(160),
          held_on: dateOnly,
          uniform_basis: z.enum(["present_only", "all_required"]),
        })
        .parse(Object.fromEntries(form));
      result = await db.rpc("create_attendance_session", {
        target_club: clubId,
        target_season: input.season_id,
        session_title: input.title,
        session_date: input.held_on,
        requires_attendance: form.get("attendance_required") === "on",
        requires_uniform: form.get("uniform_required") === "on",
        excused_as_absent: form.get("excused_counts_absent") === "on",
        uniform_basis: input.uniform_basis,
      });
    } else if (operation === "record") {
      const input = z
        .object({
          session_id: uuid,
          participant_id: uuid,
          attendance: z.enum(["present", "absent", "excused"]),
          uniform: z.enum(["yes", "no", "not_assessed"]),
        })
        .parse(Object.fromEntries(form));
      result = await db.rpc("record_attendance", {
        target_session: input.session_id,
        target_participant: input.participant_id,
        attendance_state: input.attendance,
        uniform_ok:
          input.uniform === "not_assessed" ? null : input.uniform === "yes",
      });
    } else if (operation === "verify" && roles.includes("director")) {
      const input = z
        .object({
          entry_id: uuid,
          recorded_at: z.iso.datetime({ offset: true }),
        })
        .parse(Object.fromEntries(form));
      result = await db.rpc("verify_attendance", {
        target_entry: input.entry_id,
        expected_recorded_at: input.recorded_at,
      });
    }
    if (result)
      notice = result.error
        ? result.error.code === "42501"
          ? "permission"
          : "validation"
        : "saved";
  } catch {
    notice = "validation";
  }
  revalidatePath(`/workspace/${clubId}/attendance`);
  const participant = uuid.safeParse(form.get("participant_id"));
  redirect(
    `/workspace/${clubId}/attendance?notice=${notice}${participant.success ? `&participant=${participant.data}` : ""}`,
  );
}
