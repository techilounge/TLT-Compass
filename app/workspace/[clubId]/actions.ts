"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import {
  uuid,
  ruleSchema,
  requirementSchema,
  participantSchema,
  seasonSchema,
  dateOnly,
  optionalDate,
  departments,
} from "@/modules/program-rules/contracts";
type Db = Awaited<ReturnType<typeof requireClub>>["db"];
export async function updateClub(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(120),
        timezone: z
          .string()
          .max(100)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat("en-US", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }),
      })
      .parse(Object.fromEntries(form));
    return db.from("clubs").update(input).eq("id", clubId);
  });
}
async function mutate(
  clubId: string,
  form: FormData,
  operation: (db: Db) => PromiseLike<{ error: { code?: string } | null }>,
) {
  const id = uuid.safeParse(clubId);
  if (!id.success) redirect("/workspace");
  const { db } = await requireClub(id.data);
  let notice = "saved";
  try {
    const { error } = await operation(db);
    if (error)
      notice =
        error.code === "42501"
          ? "permission"
          : error.code === "23505"
            ? "duplicate"
            : "validation";
  } catch {
    notice = "validation";
  }
  revalidatePath(`/workspace/${id.data}`, "layout");
  redirect(
    `/workspace/${id.data}${form.get("return_area") === "admin" ? "/admin" : ""}?notice=${notice}`,
  );
}
export async function createRule(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) =>
    db.from("program_rule_sets").insert({
      club_id: clubId,
      ...ruleSchema.parse(Object.fromEntries(form)),
    }),
  );
}
export async function addRequirement(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) =>
    db.from("program_requirements").insert({
      club_id: clubId,
      ...requirementSchema.parse(Object.fromEntries(form)),
    }),
  );
}
export async function approveRule(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        rule_set_id: uuid,
        source_reference: z.string().trim().min(1).max(2000),
        confirmed: z.literal("on"),
      })
      .parse(Object.fromEntries(form));
    return db.rpc("approve_rule_version", {
      target_rule: input.rule_set_id,
      confirmed_reference: input.source_reference,
    });
  });
}
export async function createSeason(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) =>
    db.from("seasons").insert({
      club_id: clubId,
      ...seasonSchema.parse(Object.fromEntries(form)),
    }),
  );
}
export async function createParticipant(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) =>
    db.from("tlt_participants").insert({
      club_id: clubId,
      ...participantSchema.parse(Object.fromEntries(form)),
    }),
  );
}
export async function updateOnboarding(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        participant_id: uuid,
        consent_state: z.enum(["pending", "confirmed", "withdrawn"]),
        registration_confirmed: z.preprocess((v) => v === "on", z.boolean()),
        prior_achievement_confirmed: z.preprocess(
          (v) => v === "on",
          z.boolean(),
        ),
        recommendations_received: z.coerce.number().int().min(0).max(10),
        recent_attendance: z.preprocess(
          (v) => (v === "" || v === null ? null : Number(v)),
          z.number().min(0).max(100).nullable(),
        ),
        probation_started_on: optionalDate,
      })
      .parse(Object.fromEntries(form));
    const { participant_id, ...values } = input;
    return db
      .from("tlt_participants")
      .update(values)
      .eq("club_id", clubId)
      .eq("id", participant_id);
  });
}
export async function assignMentor(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        participant_id: uuid,
        mentor_profile_id: uuid,
        assignment_type: z.enum(["primary", "operational"]),
        department_code: z.enum(departments).or(z.literal("")),
      })
      .parse(Object.fromEntries(form));
    return db.rpc("assign_mentor", {
      target_participant: input.participant_id,
      target_mentor: input.mentor_profile_id,
      kind: input.assignment_type,
      department:
        input.assignment_type === "primary" ? null : input.department_code,
    });
  });
}
export async function admitParticipant(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) =>
    db.rpc("admit_participant", {
      target_participant: uuid.parse(form.get("participant_id")),
    }),
  );
}
export async function assignTask(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        participant_id: uuid,
        requirement_id: uuid,
        title: z.string().trim().min(1).max(160),
        instructions: z.string().trim().max(5000),
        due_on: optionalDate,
      })
      .parse(Object.fromEntries(form));
    return db.rpc(
      form.get("creation_mode") === "draft"
        ? "create_task_draft"
        : "create_task",
      {
        target_participant: input.participant_id,
        target_requirement: input.requirement_id,
        task_title: input.title,
        task_instructions: input.instructions,
        task_due_on: input.due_on,
      },
    );
  });
}
export async function transitionTask(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        task_id: uuid,
        expected_status: z.string().max(30),
        next_status: z.enum(["assigned", "in_progress", "closed", "cancelled"]),
      })
      .parse(Object.fromEntries(form));
    return db.rpc("transition_task", {
      target_task: input.task_id,
      expected_status: input.expected_status,
      next_status: input.next_status,
    });
  });
}
export async function submitTask(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        task_id: uuid,
        evidence: z.string().trim().min(1).max(10000),
        reflection: z.string().trim().min(1).max(5000),
        activity_date: dateOnly,
      })
      .parse(Object.fromEntries(form));
    return db.rpc("submit_task", {
      target_task: input.task_id,
      evidence: input.evidence,
      reflection_text: input.reflection,
      activity_date: input.activity_date,
    });
  });
}
export async function reviewSubmission(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        submission_id: uuid,
        decision: z.enum(["verified", "changes_requested"]),
        feedback: z.string().trim().min(1).max(5000),
      })
      .parse(Object.fromEntries(form));
    return db.rpc("review_submission", {
      target_submission: input.submission_id,
      review_decision: input.decision,
      review_feedback: input.feedback,
    });
  });
}
export async function addRotation(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) => {
    const input = z
      .object({
        participant_id: uuid,
        mentor_assignment_id: uuid,
        department_code: z.enum(departments),
        starts_on: dateOnly,
        ends_on: dateOnly,
      })
      .refine((v) => v.ends_on >= v.starts_on)
      .parse(Object.fromEntries(form));
    return db.rpc("create_rotation", {
      target_participant: input.participant_id,
      target_assignment: input.mentor_assignment_id,
      department: input.department_code,
      starts: input.starts_on,
      ends: input.ends_on,
    });
  });
}
export async function reviewRotation(clubId: string, form: FormData) {
  return mutate(clubId, form, (db) =>
    db.rpc("review_rotation", {
      target_rotation: uuid.parse(form.get("rotation_id")),
    }),
  );
}
