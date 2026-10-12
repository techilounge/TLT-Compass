"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
export async function manageTeam(
  clubId: string,
  sessionId: string,
  form: FormData,
) {
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(sessionId).success)
    redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/games`);
  const session = await db
    .from("game_sessions")
    .select("id")
    .eq("club_id", clubId)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session.data) redirect(`/workspace/${clubId}/games/teams`);
  let notice = "saved";
  try {
    const operation = z
      .enum(["create", "assign", "end"])
      .parse(form.get("operation"));
    let result;
    if (operation === "create")
      result = await db.rpc("create_game_team", {
        target_session: sessionId,
        team_name: z.string().trim().min(1).max(80).parse(form.get("name")),
        member_ceiling: z.coerce
          .number()
          .int()
          .min(1)
          .max(20)
          .parse(form.get("maximum_members")),
      });
    else if (operation === "end")
      result = await db.rpc("end_game_team_membership", {
        target_session: sessionId,
        target_participant: uuid.parse(form.get("participant_id")),
      });
    else {
      const teamId = uuid.parse(form.get("team_id"));
      const team = await db
        .from("game_teams")
        .select("id")
        .eq("club_id", clubId)
        .eq("session_id", sessionId)
        .eq("id", teamId)
        .maybeSingle();
      if (!team.data) throw Error();
      result = await db.rpc("assign_game_team", {
        target_team: teamId,
        target_participant: uuid.parse(form.get("participant_id")),
      });
    }
    if (result.error) throw Error();
  } catch {
    notice = "unavailable";
  }
  revalidatePath(`/workspace/${clubId}/games/teams`);
  redirect(
    `/workspace/${clubId}/games/teams?session_id=${sessionId}&notice=${notice}`,
  );
}
