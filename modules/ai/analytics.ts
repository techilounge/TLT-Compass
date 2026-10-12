import { z } from "zod";
export const analyticsMetrics = [
  "participants",
  "active",
  "pending_enrollment",
  "missing_primary_mentor",
  "tasks",
  "pending_reviews",
  "overdue_tasks",
  "verified_tasks",
  "required_total",
  "required_completed",
  "pending_hour_reviews",
] as const;
export type AnalyticsMetric = (typeof analyticsMetrics)[number];
export function analyticsReplySchema(
  metrics: Partial<Record<AnalyticsMetric, number>>,
) {
  return z
    .object({
      observations: z
        .array(
          z
            .object({
              metric: z.enum(analyticsMetrics),
              comment: z.string().min(1).max(600),
            })
            .strict(),
        )
        .min(1)
        .max(5),
      limitations: z.array(z.string().min(1).max(300)).min(1).max(5),
    })
    .strict()
    .refine((reply) =>
      reply.observations.every((item) => Object.hasOwn(metrics, item.metric)),
    );
}
export function projectAnalytics(raw: unknown, minimumCohort: number) {
  const source = z.record(z.string(), z.unknown()).parse(raw);
  const participants = z
    .number()
    .int()
    .nonnegative()
    .parse(source.participants);
  if (
    !Number.isInteger(minimumCohort) ||
    minimumCohort < 1 ||
    minimumCohort > 100 ||
    participants < minimumCohort
  )
    throw Error("Cohort below configured minimum");
  const metrics: Partial<Record<AnalyticsMetric, number>> = {};
  for (const key of analyticsMetrics) {
    const value = z.number().int().nonnegative().safeParse(source[key]);
    if (value.success && (value.data === 0 || value.data >= minimumCohort))
      metrics[key] = value.data;
  }
  return metrics;
}
