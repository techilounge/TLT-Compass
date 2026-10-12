import { z } from "zod";
import { parse } from "csv-parse/sync";
import { departments } from "../program-rules/contracts";
export const questionInput = z
  .object({
    prompt: z.string().trim().min(5).max(2000),
    choices: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    correct_index: z.number().int().min(0).max(5),
    explanation: z.string().trim().max(3000).default(""),
    department_code: z.enum(departments),
    level: z.number().int().min(1).max(4),
    difficulty: z.enum(["introductory", "developing", "advanced"]),
    source_reference: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.correct_index >= q.choices.length)
      ctx.addIssue({
        code: "custom",
        message: "Correct answer is outside choices",
      });
    if (
      new Set(q.choices.map((c) => c.toLocaleLowerCase("en-US"))).size !==
      q.choices.length
    )
      ctx.addIssue({ code: "custom", message: "Choices must be distinct" });
  });
export type Question = z.infer<typeof questionInput>;
export type QuestionMapping = {
  prompt: string;
  choices: string[];
  correct: string;
  explanation: string;
};
export type QuestionCandidate = {
  row: number;
  question: Question | null;
  errors: string[];
  original: Record<string, string>;
};
export function parseQuestionCsv(
  source: string,
  mapping: QuestionMapping,
  options: {
    answerFormat: "letter" | "one_based" | "exact_text";
    department: Question["department_code"];
    level: number;
    difficulty: Question["difficulty"];
    sourceName: string;
  },
) {
  if (Buffer.byteLength(source, "utf8") > 512 * 1024 || source.includes("\0"))
    throw new Error("Bounded UTF-8 CSV required");
  const rows = parse(source, {
    bom: true,
    skip_empty_lines: true,
    max_record_size: 20000,
    relax_column_count: false,
  }) as string[][];
  if (rows.length < 2 || rows.length > 1001)
    throw new Error("CSV requires 1–1000 questions");
  const headers = rows[0];
  if (new Set(headers).size !== headers.length || headers.length > 100)
    throw new Error("Unique bounded headers required");
  if (
    mapping.choices.length < 2 ||
    mapping.choices.length > 6 ||
    new Set(mapping.choices).size !== mapping.choices.length
  )
    throw new Error("Map 2–6 distinct choice columns");
  const required = [mapping.prompt, ...mapping.choices, mapping.correct];
  if (
    required.some((h) => !headers.includes(h)) ||
    (mapping.explanation && !headers.includes(mapping.explanation))
  )
    throw new Error("Map exact CSV headers");
  const seen = new Set<string>();
  const candidates: QuestionCandidate[] = rows.slice(1).map((row, index) => {
    const original = Object.fromEntries(headers.map((h, i) => [h, row[i]])),
      value = (h: string) => (original[h] ?? "").trim(),
      choices = mapping.choices.map(value),
      answer = value(mapping.correct);
    const correct_index =
      options.answerFormat === "letter" && /^[A-F]$/i.test(answer)
        ? answer.toUpperCase().charCodeAt(0) - 65
        : options.answerFormat === "one_based" && /^[1-6]$/.test(answer)
          ? Number(answer) - 1
          : options.answerFormat === "exact_text"
            ? choices.indexOf(answer)
            : -1;
    const parsed = questionInput.safeParse({
      prompt: value(mapping.prompt),
      choices,
      correct_index,
      explanation: value(mapping.explanation),
      department_code: options.department,
      level: options.level,
      difficulty: options.difficulty,
      source_reference: `${options.sourceName} · CSV row ${index + 2}`,
    });
    const errors: string[] = [];
    if (!parsed.success)
      errors.push(
        "Correct question, distinct choices and explicitly mapped answer are required.",
      );
    const fingerprint = value(mapping.prompt).toLocaleLowerCase("en-US");
    if (seen.has(fingerprint)) errors.push("Duplicate prompt in this file");
    seen.add(fingerprint);
    return {
      row: index + 2,
      question: parsed.success ? parsed.data : null,
      errors,
      original,
    };
  });
  return { headers, candidates };
}
export function shuffledChoices(
  question: Question,
  randomInt: (max: number) => number,
) {
  const choices = question.choices.map((text, index) => ({
    text,
    correct: index === question.correct_index,
  }));
  for (let i = choices.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i)
      throw new Error("Invalid random index");
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
export const gameModes = [
  {
    id: "quick_round",
    name: "Quick round",
    instructions:
      "Select reviewed questions, shuffle answers for this round, discuss reasoning and review answers together.",
  },
  {
    id: "team_challenge",
    name: "Team challenge",
    instructions:
      "Choose a facilitator, recorder and presenter. Work together on reviewed questions; rotate roles and recognize cooperation.",
  },
  {
    id: "scenario_debate",
    name: "Scenario debate",
    instructions:
      "Use an adult-reviewed leadership scenario. Compare options respectfully and explain the chosen response; an adult handles safety concerns.",
  },
  {
    id: "escape_challenge",
    name: "Leadership escape challenge",
    instructions:
      "Use reviewed planning puzzles with clear instructions, time limits and accessible alternatives. Debrief communication and teamwork.",
  },
  {
    id: "planning_sprint",
    name: "Event-planning sprint",
    instructions:
      "Draft an event purpose, schedule, responsibilities, supplies and adult supervision plan. Staff review the plan before any real event.",
  },
  {
    id: "service_bingo",
    name: "Service mission bingo",
    instructions:
      "Agree on supervised service activities. Record evidence and reflect on community impact; staff verify activities separately from game scores.",
  },
  {
    id: "reflection_cards",
    name: "Reflection cards",
    instructions:
      "Discuss what worked, what changed and what to try next. Allow participants to pass and keep sensitive disclosures out of game records.",
  },
] as const;
