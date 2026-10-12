import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import { parseQuestionCsv } from "../../modules/games/questions";
describe("reviewed private question bank", () => {
  let db: TestDatabase;
  const id = randomUUID(),
    source =
      "Question,A,B,Answer\nWhich helps teamwork?,Listen,Interrupt,A\nWhich helps planning?,Schedule,Guess,Z",
    mapping = {
      prompt: "Question",
      choices: ["A", "B"],
      correct: "Answer",
      explanation: "",
    },
    parsed = parseQuestionCsv(source, mapping, {
      answerFormat: "letter",
      department: "administrative",
      level: 1,
      difficulty: "introductory",
      sourceName: "synthetic.csv",
    });
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("allows a staff preview without publishing and denies foreign imports", async () => {
    await asUser(db, ids.mentor);
    await db.query(
      "select public.save_question_import($1,$2,'synthetic.csv',$3,$4,$5,$6,$7)",
      [
        id,
        ids.north,
        "a".repeat(64),
        source,
        mapping,
        JSON.stringify(parsed.headers),
        JSON.stringify(parsed.candidates),
      ],
    );
    expect(
      (await db.query("select id from public.quiz_questions")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.question_imports")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.publish_question_import($1,array[0],true)", [id]),
    ).rejects.toThrow("Not authorized");
  });
  it("allows scoped draft enrichment, rejects stale updates and preserves original source", async () => {
    const payload = {
      ...parsed.candidates[0].question!,
      explanation: "Reviewed synthetic explanation",
    };
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.edit_question_candidate($1,0,0,$2)", [
        id,
        payload,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.edit_question_candidate($1,0,0,$2)", [
        id,
        payload,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query("select public.edit_question_candidate($1,0,0,$2)", [
      id,
      payload,
    ]);
    await expect(
      db.query("select public.edit_question_candidate($1,0,0,$2)", [
        id,
        payload,
      ]),
    ).rejects.toThrow("Preview changed");
    await expect(
      db.query("select public.edit_question_candidate($1,0,1,$2)", [
        id,
        { ...payload, department_code: "" },
      ]),
    ).rejects.toThrow("enrichment required");
    const result = await db.query<{
      original_source: string;
      candidates: typeof parsed.candidates;
    }>(
      "select original_source,candidates from public.question_imports where id=$1",
      [id],
    );
    expect(result.rows[0].original_source).toBe(source);
    expect(result.rows[0].candidates[0].original).toEqual(
      parsed.candidates[0].original,
    );
    expect(
      (await db.query("select id from public.quiz_questions")).rows,
    ).toHaveLength(0);
  });
  it("requires human manager review and publishes selected valid questions atomically", async () => {
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.publish_question_import($1,array[0],true)", [id]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query("select public.publish_question_import($1,array[0],false)", [
        id,
      ]),
    ).rejects.toThrow("Review and select");
    await expect(
      db.query("select public.publish_question_import($1,array[0,1],true)", [
        id,
      ]),
    ).rejects.toThrow("Invalid question");
    expect(
      (await db.query("select id from public.quiz_questions")).rows,
    ).toHaveLength(0);
    await db.query("select public.publish_question_import($1,array[0],true)", [
      id,
    ]);
    await db.query("select public.publish_question_import($1,array[0],true)", [
      id,
    ]);
    expect(
      (await db.query("select id from public.quiz_questions")).rows,
    ).toHaveLength(1);
  });
  it("hides source CSV and all answers from participants and rejects raw status changes", async () => {
    await asUser(db, ids.teen);
    expect(
      (await db.query("select * from public.quiz_questions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.question_imports")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("update public.quiz_questions set status='approved'"),
    ).rejects.toThrow(/permission denied/);
  });
});
