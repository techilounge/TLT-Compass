"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/modules/program-rules/contracts";
import { requireClub } from "@/lib/auth/session";
import { expandEvent } from "@/modules/calendar/events";
export async function saveCalendar(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db } = await requireClub(clubId);
  const v = Object.fromEntries(form);
  let destination = `/workspace/${clubId}/calendar`;
  let notice = "validation";
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
      case "draft": {
        const id = uuid.parse(v.request_id);
        const base = v.base_event ? uuid.parse(v.base_event) : null;
        if (base) await scoped("calendar_events", base);
        const payload = expandEvent({
          ...v,
          all_day: form.get("all_day") === "on",
        });
        result = await db.rpc("save_calendar_draft", {
          request_id: id,
          target_club: clubId,
          event_payload: payload,
          base_event: base,
          base_revision: z.coerce
            .number()
            .int()
            .min(0)
            .parse(v.base_revision ?? 0),
        });
        if (!result.error) destination += `/drafts/${id}`;
        break;
      }
      case "publish": {
        const id = uuid.parse(v.draft_id);
        await scoped("calendar_drafts", id);
        result = await db.rpc("publish_calendar_draft", {
          target_draft: id,
          conflicts_reviewed: form.get("conflicts_reviewed") === "on",
        });
        destination += result.error ? `/drafts/${id}` : `/${result.data}`;
        break;
      }
      case "discard": {
        const id = uuid.parse(v.draft_id);
        await scoped("calendar_drafts", id);
        result = await db.rpc("discard_calendar_draft", { target_draft: id });
        break;
      }
      case "cancel": {
        const id = uuid.parse(v.event_id);
        await scoped("calendar_events", id);
        result = await db.rpc("cancel_calendar_event", {
          target_event: id,
          expected_revision: z.coerce
            .number()
            .int()
            .positive()
            .parse(v.revision),
        });
        destination += `/${id}`;
        break;
      }
      case "rsvp": {
        const i = z
          .object({
            occurrence_id: uuid,
            participant_id: uuid,
            response: z.enum(["yes", "no", "maybe"]),
            event_id: uuid,
          })
          .parse(v);
        await scoped("calendar_occurrences", i.occurrence_id);
        await scoped("tlt_participants", i.participant_id);
        result = await db.rpc("respond_event", {
          target_occurrence: i.occurrence_id,
          target_participant: i.participant_id,
          answer: i.response,
        });
        destination += `/${i.event_id}`;
        break;
      }
      case "attendance": {
        const i = z
          .object({ occurrence_id: uuid, season_id: uuid, event_id: uuid })
          .parse(v);
        await scoped("calendar_occurrences", i.occurrence_id);
        await scoped("seasons", i.season_id);
        result = await db.rpc("link_event_attendance", {
          target_occurrence: i.occurrence_id,
          target_season: i.season_id,
          requires_attendance: form.get("attendance_required") === "on",
          requires_uniform: form.get("uniform_required") === "on",
          excused_as_absent: form.get("excused_counts_absent") === "on",
          uniform_basis: z
            .enum(["present_only", "all_required"])
            .parse(v.uniform_basis),
        });
        destination += `/${i.event_id}`;
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
  revalidatePath(`/workspace/${clubId}/calendar`, "layout");
  redirect(`${destination}?notice=${notice}`);
}
