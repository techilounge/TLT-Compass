import type { ParticipantRecord, RuleRecord } from "../program-rules/contracts";
export function onboardingChecks(
  p: ParticipantRecord,
  r: RuleRecord,
  hasMentor: boolean,
  today: string,
) {
  const elapsed = p.probation_started_on
    ? Math.floor(
        (Date.parse(`${today}T00:00:00Z`) -
          Date.parse(`${p.probation_started_on}T00:00:00Z`)) /
          86400000,
      )
    : null;
  return [
    { label: "Approved rule version", complete: r.status === "approved" },
    { label: "Consent confirmed", complete: p.consent_state === "confirmed" },
    {
      label: "Annual registration confirmed",
      complete: p.registration_confirmed,
    },
    {
      label: `Grade ${r.minimum_grade}–${r.maximum_grade}`,
      complete:
        p.grade_level >= r.minimum_grade && p.grade_level <= r.maximum_grade,
    },
    {
      label: "Prior achievement",
      complete: !r.require_prior_achievement || p.prior_achievement_confirmed,
    },
    {
      label: `Recommendations (${p.recommendations_received}/${r.recommendation_count})`,
      complete: p.recommendations_received >= r.recommendation_count,
    },
    {
      label: `Recent attendance ≥ ${r.minimum_attendance}%`,
      complete:
        p.recent_attendance !== null &&
        p.recent_attendance >= r.minimum_attendance,
    },
    {
      label: `Probation (${elapsed ?? 0}/${r.probation_days} days)`,
      complete: elapsed !== null && elapsed >= r.probation_days,
    },
    { label: "Eligible primary mentor assigned", complete: hasMentor },
  ];
}
