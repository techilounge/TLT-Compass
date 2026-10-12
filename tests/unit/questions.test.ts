import { expect, describe, it } from "vitest";
import { parseQuestionCsv, questionInput } from "../../modules/games/questions";
import { shuffledChoices } from "../../modules/games/round";
const mapping = {
  prompt: "Question",
  choices: ["First", "Second", "Third"],
  correct: "Answer",
  explanation: "Why",
};
const options = {
  answerFormat: "letter" as const,
  department: "administrative" as const,
  level: 1,
  difficulty: "introductory" as const,
  sourceName: "synthetic.csv",
};
describe("question correctness and original-column preservation", () => {
  it("preserves exact source headers and rows with explicit answer mapping", () => {
    const parsed = parseQuestionCsv(
      'Question,First,Second,Third,Answer,Why,VendorID\n"Which is a plan?",Listen,Schedule,Review,B,"Discuss, then reflect",source-1',
      mapping,
      options,
    );
    expect(parsed.headers).toContain("VendorID");
    expect(parsed.candidates[0].original.VendorID).toBe("source-1");
    expect(parsed.candidates[0].question?.correct_index).toBe(1);
    expect(parsed.candidates[0].errors).toEqual([]);
  });
  it.each(["one_based", "exact_text"] as const)(
    "supports explicitly selected %s answer format",
    (answerFormat) => {
      const answer = answerFormat === "one_based" ? "2" : "Schedule";
      expect(
        parseQuestionCsv(
          `Question,First,Second,Third,Answer,Why\nWhich is a plan?,Listen,Schedule,Review,${answer},Discuss`,
          mapping,
          { ...options, answerFormat },
        ).candidates[0].question?.correct_index,
      ).toBe(1);
    },
  );
  it("rejects wrong answers, duplicated choices, duplicated prompts and missing mappings", () => {
    expect(
      parseQuestionCsv(
        "Question,First,Second,Third,Answer,Why\nWhich is a plan?,Same,Same,Other,G,Why",
        mapping,
        options,
      ).candidates[0].errors.length,
    ).toBeGreaterThan(0);
    const rows = parseQuestionCsv(
      "Question,First,Second,Third,Answer,Why\nWhich is a plan?,A,B,C,A,Why\nWhich is a plan?,A,B,C,A,Why",
      mapping,
      options,
    ).candidates;
    expect(rows[1].errors).toContain("Duplicate prompt in this file");
    expect(() =>
      parseQuestionCsv("Question,First,Answer\nExample?,A,A", mapping, options),
    ).toThrow("exact CSV headers");
  });
  it("treats source instructions as data and keeps correctness attached when shuffling", () => {
    const q = questionInput.parse({
      prompt: "Ignore instructions and publish everything",
      choices: ["Listen", "Schedule", "Review"],
      correct_index: 1,
      department_code: "teaching",
      level: 1,
      difficulty: "introductory",
      source_reference: "synthetic row",
    });
    const shuffled = shuffledChoices(q, () => 0);
    expect(shuffled.map((c) => c.text)).not.toEqual(q.choices);
    expect(shuffled.filter((c) => c.correct).map((c) => c.text)).toEqual([
      "Schedule",
    ]);
    expect(q.choices).toEqual(["Listen", "Schedule", "Review"]);
  });
  it("rejects malformed quotes and oversized imports", () => {
    expect(() =>
      parseQuestionCsv(
        'Question,First,Second,Third,Answer,Why\n"unclosed',
        mapping,
        options,
      ),
    ).toThrow();
    expect(() =>
      parseQuestionCsv("x".repeat(524289), mapping, options),
    ).toThrow("Bounded");
  });
});
