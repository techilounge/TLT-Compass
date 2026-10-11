import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("human reviewed AI task drafts", () => {
  let db: TestDatabase;
  const proposal = randomUUID(),
    participant = "60000000-0000-4000-8000-000000000001",
    requirement = "40000000-0000-4000-8000-000000000001",
    rule = "30000000-0000-4000-8000-000000000001";
  const payload = {
    title: "Supervised synthetic task",
    instructions: "Review the source with an adult mentor",
    due_on: null,
  };
  beforeAll(async () => {
    db = await createTestDatabase();
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version($1,'Synthetic approved source')",
      [rule],
    );
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await db.query("select public.admit_participant($1)", [participant]);
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("restricts generation and creates no task before human review", async () => {
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.propose_ai_task($1,$2,$3,$4,$5)", [
        proposal,
        ids.north,
        participant,
        requirement,
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query("select public.propose_ai_task($1,$2,$3,$4,$5)", [
      proposal,
      ids.north,
      participant,
      requirement,
      JSON.stringify(payload),
    ]);
    expect((await db.query("select id from public.tasks")).rows).toHaveLength(
      0,
    );
  });
  it("rejects tenant substitution, unreviewed changes and raw status updates", async () => {
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.ai_task_proposals")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.review_ai_task_proposal($1,true,$2)", [
        proposal,
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query("select public.review_ai_task_proposal($1,true,$2)", [
        proposal,
        JSON.stringify({ ...payload, title: "Different" }),
      ]),
    ).rejects.toThrow("exact proposed");
    await expect(
      db.query(
        "update public.ai_task_proposals set status='approved' where id=$1",
        [proposal],
      ),
    ).rejects.toThrow();
  });
  it("rechecks consent at review and idempotently creates only a draft", async () => {
    await db.query(
      "update public.tlt_participants set consent_state='withdrawn' where id=$1",
      [participant],
    );
    await expect(
      db.query("select public.review_ai_task_proposal($1,true,$2)", [
        proposal,
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Active participant");
    await db.query(
      "update public.tlt_participants set consent_state='confirmed' where id=$1",
      [participant],
    );
    const first = (
      await db.query<{ id: string }>(
        "select public.review_ai_task_proposal($1,true,$2) id",
        [proposal, JSON.stringify(payload)],
      )
    ).rows[0].id;
    const retry = (
      await db.query<{ id: string }>(
        "select public.review_ai_task_proposal($1,true,$2) id",
        [proposal, JSON.stringify(payload)],
      )
    ).rows[0].id;
    expect(retry).toBe(first);
    expect(
      (await db.query("select status from public.tasks where id=$1", [first]))
        .rows,
    ).toEqual([{ status: "draft" }]);
    expect(
      (await db.query("select id from public.participant_requirements")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.tasks where id=$1", [first])).rows,
    ).toHaveLength(0);
  });
  it("rejects foreign requirements and unrecognized write fields", async () => {
    await asUser(db, ids.director);
    await expect(
      db.query("select public.propose_ai_task($1,$2,$3,$4,$5)", [
        randomUUID(),
        ids.north,
        participant,
        "40000000-0000-4000-8000-000000000002",
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Active participant");
    await expect(
      db.query("select public.propose_ai_task($1,$2,$3,$4,$5)", [
        randomUUID(),
        ids.north,
        participant,
        requirement,
        JSON.stringify({ ...payload, status: "verified" }),
      ]),
    ).rejects.toThrow("Invalid task proposal");
  });
  it("records rejection without creating a task", async () => {
    const id = randomUUID();
    await db.query("select public.propose_ai_task($1,$2,$3,$4,$5)", [
      id,
      ids.north,
      participant,
      requirement,
      JSON.stringify(payload),
    ]);
    await db.query("select public.review_ai_task_proposal($1,false,$2)", [
      id,
      JSON.stringify(payload),
    ]);
    expect((await db.query("select id from public.tasks")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await db.query(
          "select status,reviewed_by,result_task_id from public.ai_task_proposals where id=$1",
          [id],
        )
      ).rows,
    ).toEqual([
      { status: "rejected", reviewed_by: ids.director, result_task_id: null },
    ]);
  });
});
