import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001";
const request = "80000000-0000-4000-8000-000000000001";
describe("training hour evidence and review", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("accepts participant evidence and makes retries idempotent", async () => {
    await asUser(db, ids.teen);
    const sql =
      "select public.submit_training_hours($1,$2,'workshop','outreach',date_trunc('day',now())-interval '2 days'+interval '10 hours',date_trunc('day',now())-interval '2 days'+interval '11 hours','Synthetic workshop practice') as id";
    expect((await db.query(sql, [request, participant])).rows[0].id).toBe(
      request,
    );
    expect((await db.query(sql, [request, participant])).rows[0].id).toBe(
      request,
    );
    expect(
      (await db.query("select id from public.training_hours")).rows,
    ).toHaveLength(1);
    expect(
      Number(
        (
          await db.query("select * from public.training_hours_summary($1)", [
            participant,
          ])
        ).rows[0].workshop_minutes,
      ),
    ).toBe(0);
    await expect(
      db.query(
        "select public.submit_training_hours($1,$2,'workshop','outreach',now()-interval '2 hours',now()-interval '1 hour','changed request')",
        [request, participant],
      ),
    ).rejects.toThrow("Request ID");
  });
  it("blocks overlapping categories, future hours and invalid durations", async () => {
    await expect(
      db.query(
        "select public.submit_training_hours('80000000-0000-4000-8000-000000000002',$1,'lab','outreach',date_trunc('day',now())-interval '2 days'+interval '10 hours 30 minutes',date_trunc('day',now())-interval '2 days'+interval '12 hours','overlap')",
        [participant],
      ),
    ).rejects.toThrow("overlap");
    await expect(
      db.query(
        "select public.submit_training_hours('80000000-0000-4000-8000-000000000002',$1,'lab','outreach',now(),now()+interval '1 hour','future')",
        [participant],
      ),
    ).rejects.toThrow("Hours must");
    await expect(
      db.query(
        "select public.submit_training_hours('80000000-0000-4000-8000-000000000002',$1,'lab','outreach',now()-interval '2 hours',now()-interval '3 hours','negative')",
        [participant],
      ),
    ).rejects.toThrow("Hours must");
    await expect(
      db.query(
        "select public.review_training_hours($1,'verified','self review')",
        [request],
      ),
    ).rejects.toThrow("Not authorized");
  });
  it("requires assigned eligible adult reviewer and keeps totals separate", async () => {
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.training_hours")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "select public.review_training_hours($1,'verified','cross club')",
        [request],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query("select public.review_training_hours($1,'verified','no MFA')", [
        request,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query(
      "select public.review_training_hours($1,'verified','Reviewed the workshop evidence')",
      [request],
    );
    const totals = (
      await db.query("select * from public.training_hours_summary($1)", [
        participant,
      ])
    ).rows[0];
    expect(Number(totals.workshop_minutes)).toBe(60);
    expect(Number(totals.lab_minutes)).toBe(0);
    await expect(
      db.query(
        "select public.review_training_hours($1,'rejected','overwrite')",
        [request],
      ),
    ).rejects.toThrow("Invalid review");
    await db.exec("reset role");
    await expect(
      db.query(
        "update public.training_hours set evidence='rewritten' where id=$1",
        [request],
      ),
    ).rejects.toThrow("immutable");
  });
  it("rejects adult self-approval and releases rejected intervals for corrected entries", async () => {
    await asUser(db, ids.director);
    const staffRequest = "80000000-0000-4000-8000-000000000003";
    await db.query(
      "select public.submit_training_hours($1,$2,'lab','outreach',date_trunc('day',now())-interval '2 days'+interval '11 hours',date_trunc('day',now())-interval '2 days'+interval '12 hours','staff submitted')",
      [staffRequest, participant],
    );
    await expect(
      db.query("select public.review_training_hours($1,'verified','self')", [
        staffRequest,
      ]),
    ).rejects.toThrow("No self-review");
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await asUser(db, ids.mentor);
    await db.query(
      "select public.review_training_hours($1,'rejected','Incorrect practical category; please resubmit')",
      [staffRequest],
    );
    await asUser(db, ids.teen);
    await db.query(
      "select public.submit_training_hours('80000000-0000-4000-8000-000000000004',$1,'workshop','outreach',date_trunc('day',now())-interval '2 days'+interval '11 hours',date_trunc('day',now())-interval '2 days'+interval '12 hours','corrected category')",
      [participant],
    );
    await expect(
      db.query("update public.training_hours set status='verified'"),
    ).rejects.toThrow();
  });
});
