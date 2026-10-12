"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid, departments } from "@/modules/program-rules/contracts";
const reason = z.string().trim().min(1).max(1000);
export async function saveRecognition(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db } = await requireClub(clubId);
  let notice = "validation";
  const values = Object.fromEntries(form);
  const scoped = async (table: string, id: string) => {
    const result = await db
      .from(table)
      .select("id")
      .eq("club_id", clubId)
      .eq("id", id)
      .maybeSingle();
    if (result.error || !result.data) throw new Error("Record unavailable");
  };
  try {
    let result;
    switch (form.get("operation")) {
      case "create_rule": {
        const i = z
          .object({
            name: z.string().trim().min(1).max(120),
            version: z.string().trim().min(1).max(80),
            category: z.enum([
              "attendance",
              "task",
              "leadership",
              "collaboration",
              "reflection",
              "service",
              "quiz",
            ]),
            points: z.coerce.number().int().min(1).max(1000),
            activity_cap: z.coerce.number().int().min(1).max(1000),
            monthly_cap: z.coerce.number().int().min(1).max(10000),
            department: z.union([z.literal(""), z.enum(departments)]),
          })
          .parse(values);
        result = await db.rpc("create_point_rule", {
          target_club: clubId,
          rule_name: i.name,
          rule_version: i.version,
          rule_category: i.category,
          award_points: i.points,
          per_activity_cap: i.activity_cap,
          per_month_cap: i.monthly_cap,
          department: i.department || null,
        });
        break;
      }
      case "rule_status": {
        const i = z
          .object({ rule_id: uuid, status: z.enum(["approved", "retired"]) })
          .parse(values);
        await scoped("point_rules", i.rule_id);
        result = await db.rpc("set_point_rule_status", {
          target_rule: i.rule_id,
          rule_status: i.status,
        });
        break;
      }
      case "award": {
        const i = z
          .object({
            participant_id: uuid,
            rule_id: uuid,
            request_id: uuid,
            source_kind: z.enum([
              "attendance",
              "task_review",
              "training_hours",
              "manual",
            ]),
            source_id: uuid,
            reason,
          })
          .parse(values);
        await scoped("tlt_participants", i.participant_id);
        await scoped("point_rules", i.rule_id);
        result = await db.rpc("award_points", {
          request_id: i.request_id,
          target_participant: i.participant_id,
          target_rule: i.rule_id,
          event_kind: i.source_kind,
          event_id: i.source_id,
          award_reason: i.reason,
        });
        break;
      }
      case "reverse": {
        const i = z
          .object({ request_id: uuid, award_id: uuid, reason })
          .parse(values);
        await scoped("points_ledger", i.award_id);
        result = await db.rpc("reverse_points", {
          request_id: i.request_id,
          target_award: i.award_id,
          reversal_reason: i.reason,
        });
        break;
      }
      case "settings": {
        const i = z
          .object({ quiz_percent: z.coerce.number().int().min(0).max(50) })
          .parse(values);
        result = await db.rpc("configure_recognition", {
          target_club: clubId,
          quiz_percent: i.quiz_percent,
          rankings_enabled: form.get("enabled") === "on",
        });
        break;
      }
      case "consent": {
        const i = z.object({ participant_id: uuid }).parse(values);
        await scoped("tlt_participants", i.participant_id);
        result = await db.rpc("set_leaderboard_consent", {
          target_participant: i.participant_id,
          allow_ranking: form.get("allow") === "on",
          consent_confirmed: form.get("confirmed") === "on",
        });
        break;
      }
      case "create_badge": {
        const i = z
          .object({
            name: z.string().trim().min(1).max(100),
            criteria: z.string().trim().min(1).max(2000),
          })
          .parse(values);
        result = await db.rpc("create_badge", {
          target_club: clubId,
          badge_name: i.name,
          badge_criteria: i.criteria,
        });
        break;
      }
      case "award_badge": {
        const i = z
          .object({ participant_id: uuid, badge_id: uuid, reason })
          .parse(values);
        await scoped("tlt_participants", i.participant_id);
        await scoped("badge_definitions", i.badge_id);
        result = await db.rpc("award_badge", {
          target_participant: i.participant_id,
          target_badge: i.badge_id,
          award_reason: i.reason,
        });
        break;
      }
      case "revoke_badge": {
        const i = z.object({ award_id: uuid, reason }).parse(values);
        await scoped("badge_awards", i.award_id);
        result = await db.rpc("revoke_badge", {
          target_award: i.award_id,
          explanation: i.reason,
        });
        break;
      }
      default:
        throw new Error("Invalid operation");
    }
    notice = result.error
      ? result.error.code === "42501"
        ? "permission"
        : "validation"
      : "saved";
  } catch {
    notice = "validation";
  }
  revalidatePath(`/workspace/${clubId}/recognition`);
  redirect(`/workspace/${clubId}/recognition?notice=${notice}`);
}
