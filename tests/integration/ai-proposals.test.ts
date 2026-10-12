import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import { expandEvent } from "../../modules/calendar/events";
describe("human AI event approval", () => {
  let db: TestDatabase;
  const id = randomUUID(),
    payload = expandEvent({
      title: "Synthetic supervised event",
      timezone: "America/Chicago",
      start_local: "2027-03-01T10:00",
      end_local: "2027-03-01T11:00",
    });
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("limits proposals to authorized club managers and never publishes on creation", async () => {
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.propose_ai_event($1,$2,$3)", [
        id,
        ids.north,
        payload,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query("select public.propose_ai_event($1,$2,$3)", [
      id,
      ids.north,
      payload,
    ]);
    expect(
      (await db.query("select id from public.calendar_drafts")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.calendar_events")).rows,
    ).toHaveLength(0);
  });
  it("rejects foreign review, edited payloads and raw status updates", async () => {
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.ai_proposals")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.review_ai_event_proposal($1,true,$2)", [
        id,
        payload,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query("select public.review_ai_event_proposal($1,true,$2)", [
        id,
        { ...payload, title: "Unreviewed change" },
      ]),
    ).rejects.toThrow("exact proposed");
    await expect(
      db.query("update public.ai_proposals set status='approved' where id=$1", [
        id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("records a human reviewer and idempotently creates only a private draft", async () => {
    const first = (
      await db.query<{ id: string }>(
        "select public.review_ai_event_proposal($1,true,$2) id",
        [id, payload],
      )
    ).rows[0].id;
    const retry = (
      await db.query<{ id: string }>(
        "select public.review_ai_event_proposal($1,true,$2) id",
        [id, payload],
      )
    ).rows[0].id;
    expect(retry).toBe(first);
    expect(
      (await db.query("select id from public.calendar_events")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select id from public.calendar_drafts where status='draft'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ reviewed_by: string }>(
          "select reviewed_by from public.ai_proposals where id=$1",
          [id],
        )
      ).rows[0].reviewed_by,
    ).toBe(ids.director);
    await expect(
      db.query("select public.review_ai_event_proposal($1,false,$2)", [
        id,
        payload,
      ]),
    ).rejects.toThrow("already reviewed");
  });
});
