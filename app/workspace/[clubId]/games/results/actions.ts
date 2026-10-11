"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { gameModes } from "@/modules/games/questions";
export async function saveGameResult(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  let notice = "saved";
  try {
    const operation = z
      .enum(["session", "close", "score", "review"])
      .parse(form.get("operation"));
    let result;
    if (operation === "session") {
      if (
        !roles.some((r) =>
          [
            "director",
            "coordinator",
            "primary_mentor",
            "operational_mentor",
          ].includes(r),
        )
      )
        throw new Error();
      const season = uuid.parse(form.get("season_id"));
      const record = await db
        .from("seasons")
        .select("id")
        .eq("club_id", clubId)
        .eq("id", season)
        .single();
      if (record.error) throw new Error();
      result = await db.rpc("create_game_session", {
        target_club: clubId,
        target_season: season,
        session_title: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .parse(form.get("title")),
        game_mode: z
          .enum([...gameModes.map((m) => m.id), "custom"])
          .parse(form.get("mode")),
        session_instructions: z
          .string()
          .trim()
          .min(1)
          .max(4000)
          .parse(form.get("instructions")),
        score_ceiling: z.coerce
          .number()
          .int()
          .min(1)
          .max(100000)
          .parse(form.get("maximum_score")),
        attempt_ceiling: z.coerce
          .number()
          .int()
          .min(1)
          .max(10)
          .parse(form.get("maximum_attempts")),
      });
    } else if (operation === "score" || operation === "close") {
      const session = uuid.parse(form.get("session_id"));
      const record = await db
        .from("game_sessions")
        .select("id")
        .eq("club_id", clubId)
        .eq("id", session)
        .single();
      if (record.error) throw new Error();
      if (operation === "close")
        result = await db.rpc("close_game_session", {
          target_session: session,
        });
      else
        result = await db.rpc("submit_game_score", {
          request_id: uuid.parse(form.get("request_id")),
          target_session: session,
          target_participant: uuid.parse(form.get("participant_id")),
          reported_score: z.coerce
            .number()
            .int()
            .min(0)
            .max(100000)
            .parse(form.get("score")),
          score_source: z
            .enum(["manual", "sabiquiz_manual"])
            .parse(form.get("source_kind")),
          score_reference: z
            .string()
            .trim()
            .min(1)
            .max(500)
            .parse(form.get("source_reference")),
        });
    } else {
      const score = uuid.parse(form.get("score_id"));
      const record = await db
        .from("game_scores")
        .select("id")
        .eq("club_id", clubId)
        .eq("id", score)
        .single();
      if (record.error) throw new Error();
      result = await db.rpc("review_game_score", {
        target_score: score,
        decision: z.enum(["verified", "rejected"]).parse(form.get("decision")),
        feedback: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .parse(form.get("feedback")),
      });
    }
    if (result.error) throw new Error();
  } catch {
    notice = "validation";
  }
  revalidatePath(`/workspace/${clubId}/games`, "layout");
  redirect(`/workspace/${clubId}/games/results?notice=${notice}`);
}
