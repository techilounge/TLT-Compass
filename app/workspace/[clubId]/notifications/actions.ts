"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
export async function readNotification(clubId: string, id: string) {
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(id).success)
    redirect("/workspace");
  const { db } = await requireClub(clubId);
  const own = await db
    .from("notifications")
    .select("id")
    .eq("club_id", clubId)
    .eq("id", id)
    .maybeSingle();
  if (!own.data)
    redirect(`/workspace/${clubId}/notifications?notice=unavailable`);
  const result = await db.rpc("mark_notification_read", {
    target_notification: id,
  });
  if (result.error)
    redirect(`/workspace/${clubId}/notifications?notice=unavailable`);
  revalidatePath(`/workspace/${clubId}/notifications`);
}
export async function saveNotificationPreferences(
  clubId: string,
  form: FormData,
) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db } = await requireClub(clubId);
  const result = await db.rpc("set_notification_preferences", {
    target_club: clubId,
    receive_task_updates: form.get("task_updates") === "on",
  });
  if (result.error)
    redirect(`/workspace/${clubId}/notifications?notice=unavailable`);
  revalidatePath(`/workspace/${clubId}/notifications`);
}
