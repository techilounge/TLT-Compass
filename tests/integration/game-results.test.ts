import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001",
  season = "50000000-0000-4000-8000-000000000001";
describe("supervised game results", () => {
  let db: TestDatabase, session: string;
  const score = randomUUID();
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.exec(
      `update public.tlt_participants set status='active',consent_state='confirmed',admitted_by='${ids.director}',admitted_at=now() where id='${participant}'`,
    );
    await asUser(db, ids.director);
    session = (
      await db.query<{ id: string }>(
        "select public.create_game_session($1,$2,'Synthetic session','team_challenge','Supervised practice',100,1) id",
        [ids.north, season],
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("rejects foreign submissions, excessive scores and duplicate attempts", async () => {
    await asUser(db, ids.otherDirector);
    await expect(
      db.query(
        "select public.submit_game_score($1,$2,$3,80,'manual','Synthetic source')",
        [score, session, participant],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.teen);
    await expect(
      db.query(
        "select public.submit_game_score($1,$2,$3,101,'manual','Synthetic source')",
        [score, session, participant],
      ),
    ).rejects.toThrow("Score unavailable");
    await db.query(
      "select public.submit_game_score($1,$2,$3,80,'manual','Synthetic source')",
      [score, session, participant],
    );
    await db.query(
      "select public.submit_game_score($1,$2,$3,80,'manual','Synthetic source')",
      [score, session, participant],
    );
    await expect(
      db.query(
        "select public.submit_game_score($1,$2,$3,80,'manual','Synthetic source')",
        [randomUUID(), session, participant],
      ),
    ).rejects.toThrow("attempt limit");
  });
  it("requires a scoped adult review without automatic points or completion", async () => {
    await expect(
      db.query("select public.review_game_score($1,'verified','Reviewed')", [
        score,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.game_scores")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.director);
    await db.query(
      "select public.review_game_score($1,'verified','Reviewed together')",
      [score],
    );
    await expect(
      db.query("select public.review_game_score($1,'rejected','Changed')", [
        score,
      ]),
    ).rejects.toThrow("Pending score");
    expect(
      (await db.query("select id from public.points_ledger")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.participant_requirements")).rows,
    ).toHaveLength(0);
  });
  it("closes sessions to new scores and denies raw score changes", async () => {
    await db.query("select public.close_game_session($1)", [session]);
    await db.query("select public.close_game_session($1)", [session]);
    await expect(
      db.query("update public.game_scores set score=100 where id=$1", [score]),
    ).rejects.toThrow(/permission denied/);
  });
});
