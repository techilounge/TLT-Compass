import { describe, expect, it } from "vitest";
import { onboardingChecks } from "../../modules/participants/onboarding";
import type {
  ParticipantRecord,
  RuleRecord,
} from "../../modules/program-rules/contracts";
const participant: ParticipantRecord = {
  id: "demo",
  public_alias: "Demo",
  profile_id: null,
  grade_level: 9,
  current_level: 1,
  status: "pending",
  consent_state: "confirmed",
  season_id: "demo",
  registration_confirmed: true,
  prior_achievement_confirmed: true,
  recommendations_received: 3,
  recent_attendance: 80,
  probation_started_on: "2026-08-12",
};
const rule: RuleRecord = {
  id: "demo",
  version: "test",
  source_title: "Synthetic",
  source_reference: "Synthetic",
  status: "approved",
  minimum_grade: 9,
  maximum_grade: 12,
  minimum_attendance: 80,
  recommendation_count: 3,
  probation_days: 60,
  require_prior_achievement: true,
};
describe("configurable onboarding checklist", () => {
  it("handles the exact probation and attendance boundaries", () => {
    expect(
      onboardingChecks(participant, rule, true, "2026-10-11").every(
        (c) => c.complete,
      ),
    ).toBe(true);
    expect(
      onboardingChecks(participant, rule, true, "2026-10-10").find((c) =>
        c.label.startsWith("Probation"),
      )?.complete,
    ).toBe(false);
  });
  it("honors a stricter version without changing participant history", () => {
    const checks = onboardingChecks(
      participant,
      { ...rule, minimum_attendance: 90, recommendation_count: 4 },
      true,
      "2026-10-11",
    );
    expect(checks.filter((c) => !c.complete)).toHaveLength(2);
  });
  it("does not treat missing attendance, consent or a draft as complete", () => {
    const checks = onboardingChecks(
      { ...participant, recent_attendance: null, consent_state: "pending" },
      { ...rule, status: "draft" },
      false,
      "2026-10-11",
    );
    expect(checks.filter((c) => !c.complete)).toHaveLength(4);
  });
});
