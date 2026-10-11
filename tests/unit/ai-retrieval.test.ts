import { describe, it, expect } from "vitest";
import {
  retrieveRuleExcerpts,
  type RuleExcerpt,
} from "../../modules/ai/retrieval";
const source = (id: string, description: string): RuleExcerpt => ({
  id,
  description,
  source_page: "12",
  source_section: "Manual",
  level: 1,
  department_code: "administrative",
});
describe("bounded rule retrieval", () => {
  it("ranks relevant excerpts ahead of ID order and preserves complete evidence", () => {
    const result = retrieveRuleExcerpts(
      "How do I plan outreach?",
      [source("a", "Record minutes"), source("z", "Plan outreach")],
      {},
    );
    expect(result.sources[0].id).toBe("z");
    expect(JSON.parse(result.prompt).sources[0].description).toBe(
      "Plan outreach",
    );
  });
  it("bounds large curricula, counts omitted sources and uses stable ties", () => {
    const candidates = Array.from({ length: 1000 }, (_, i) =>
      source(String(i).padStart(4, "0"), "x".repeat(2000)),
    );
    const result = retrieveRuleExcerpts("Any requirements?", candidates, {});
    expect(result.available).toBe(1000);
    expect(result.prompt.length).toBeLessThanOrEqual(22000);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeLessThan(40);
    expect(result.sources[0].id).toBe("0000");
    expect(result.sources.every((s) => s.description.length === 2000)).toBe(
      true,
    );
  });
  it("rejects oversized metadata before any provider request", () => {
    expect(() =>
      retrieveRuleExcerpts("Question", [], { source: "x".repeat(23000) }),
    ).toThrow("context limit");
  });
});
