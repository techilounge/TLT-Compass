import { z } from "zod";
export const departments = [
  "administrative",
  "outreach",
  "teaching",
  "activities",
  "records",
  "counseling",
  "special_1",
  "special_2",
] as const;
export const departmentLabels: Record<(typeof departments)[number], string> = {
  administrative: "Administrative",
  outreach: "Outreach",
  teaching: "Teaching",
  activities: "Activities",
  records: "Records",
  counseling: "Counseling",
  special_1: "Special Operations 1",
  special_2: "Special Operations 2",
};
export const uuid = z.uuid();
export const dateOnly = z.iso.date();
export const optionalDate = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  dateOnly.nullable(),
);
export const optionalUuid = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  uuid.nullable(),
);
export const ruleSchema = z
  .object({
    version: z.string().trim().min(1).max(80),
    source_title: z.string().trim().min(1).max(200),
    minimum_grade: z.coerce.number().int().min(1).max(12),
    maximum_grade: z.coerce.number().int().min(1).max(12),
    minimum_attendance: z.coerce.number().min(0).max(100),
    recommendation_count: z.coerce.number().int().min(0).max(10),
    probation_days: z.coerce.number().int().min(0).max(365),
    require_prior_achievement: z.preprocess((v) => v === "on", z.boolean()),
  })
  .refine((v) => v.minimum_grade <= v.maximum_grade);
export const requirementSchema = z.object({
  rule_set_id: uuid,
  level: z.coerce.number().int().min(1).max(4),
  department_code: z.enum(departments),
  requirement_type: z.enum(["required", "optional"]),
  description: z.string().trim().min(1).max(2000),
  source_page: z.string().trim().min(1).max(80),
  source_section: z.string().trim().min(1).max(200),
});
export const participantSchema = z.object({
  season_id: uuid,
  profile_id: optionalUuid,
  public_alias: z.string().trim().min(1).max(80),
  grade_level: z.coerce.number().int().min(1).max(12),
});
export const seasonSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    starts_on: dateOnly,
    ends_on: dateOnly,
    schedule_months: z.coerce
      .number()
      .pipe(z.union([z.literal(9), z.literal(12)])),
    rule_set_id: uuid,
  })
  .refine((v) => v.ends_on >= v.starts_on);
export type ParticipantRecord = {
  id: string;
  public_alias: string;
  profile_id: string | null;
  grade_level: number;
  current_level: number;
  status: string;
  consent_state: string;
  season_id: string;
  registration_confirmed: boolean;
  prior_achievement_confirmed: boolean;
  recommendations_received: number;
  recent_attendance: number | null;
  probation_started_on: string | null;
};
export type RuleRecord = {
  id: string;
  version: string;
  source_title: string;
  source_reference: string;
  status: string;
  minimum_grade: number;
  maximum_grade: number;
  minimum_attendance: number;
  recommendation_count: number;
  probation_days: number;
  require_prior_achievement: boolean;
};
