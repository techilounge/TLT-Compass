import { describe, it, expect } from "vitest";
import {
  projectAnalytics,
  analyticsReplySchema,
} from "../../modules/ai/analytics";
describe("bounded analytics projection", () => {
  it("rejects fabricated metric references and mutation/tool payloads", () => {
    const schema = analyticsReplySchema({ participants: 10 });
    const valid = {
      observations: [
        {
          metric: "participants",
          comment: "Review this snapshot with your director.",
        },
      ],
      limitations: ["A single snapshot cannot establish a trend."],
    };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(
      schema.safeParse({
        ...valid,
        observations: [{ metric: "pending_reviews", comment: "Unsupported" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...valid,
        sql: "delete from tasks",
        tools: [{ action: "award_points" }],
      }).success,
    ).toBe(false);
  });
  it("excludes identifiers and unknown nested fields and suppresses small nonzero counts", () => {
    const result = projectAnalytics(
      {
        participants: 10,
        active: 9,
        pending_enrollment: 1,
        tasks: 20,
        overdue_tasks: 0,
        mentor_caseload: [{ mentor_id: "private" }],
        participant_id: "private",
        evidence: "private",
      },
      5,
    );
    expect(result).toEqual({
      participants: 10,
      active: 9,
      tasks: 20,
      overdue_tasks: 0,
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("rejects undersized cohorts and invalid policy bounds", () => {
    expect(() => projectAnalytics({ participants: 4 }, 5)).toThrow();
    expect(() => projectAnalytics({ participants: 10 }, 0)).toThrow();
    expect(() => projectAnalytics({ participants: 10 }, 101)).toThrow();
  });
  it("rejects invalid cohort data and excludes invalid metric values", () => {
    expect(() => projectAnalytics({ participants: "10" }, 5)).toThrow();
    expect(
      projectAnalytics({ participants: 10, tasks: -1, active: "9" }, 5),
    ).toEqual({ participants: 10 });
  });
});
