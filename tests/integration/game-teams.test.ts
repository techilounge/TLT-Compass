import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001",
  season = "50000000-0000-4000-8000-000000000001",
  rule = "30000000-0000-4000-8000-000000000001";
describe("supervised team challenge membership", () => {
  let db: TestDatabase, session: string, teamA: string, teamB: string;
  const second = randomUUID();
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.query(
      "insert into public.tlt_participants(id,club_id,season_id,public_alias,grade_level,consent_state,registration_confirmed,prior_achievement_confirmed,recommendations_received,recent_attendance,probation_started_on) select $1,club_id,season_id,'Second Synthetic',grade_level,consent_state,registration_confirmed,prior_achievement_confirmed,recommendations_received,recent_attendance,probation_started_on from public.tlt_participants where id=$2",
      [second, participant],
    );
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version($1,'Synthetic team fixture')",
      [rule],
    );
    for (const id of [participant, second]) {
      await db.query("select public.assign_mentor($1,$2,'primary',null)", [
        id,
        ids.mentor,
      ]);
      await db.query("select public.admit_participant($1)", [id]);
    }
    session = (
      await db.query<{ id: string }>(
        "select public.create_game_session($1,$2,'Synthetic cooperative challenge','team_challenge','Plan together with an adult facilitator',100,1) id",
        [ids.north, season],
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("requires a scoped manager and creates configurable bounded teams", async () => {
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.create_game_team($1,'Foreign',6)", [session]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.create_game_team($1,'Mentor',6)", [session]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    teamA = (
      await db.query<{ id: string }>(
        "select public.create_game_team($1,'Team A',1) id",
        [session],
      )
    ).rows[0].id;
    teamB = (
      await db.query<{ id: string }>(
        "select public.create_game_team($1,'Team B',2) id",
        [session],
      )
    ).rows[0].id;
    await expect(
      db.query("select public.create_game_team($1,' team a ',1)", [session]),
    ).rejects.toThrow();
  });
  it("enforces capacity, idempotency and one current membership while preserving moves", async () => {
    const first = (
      await db.query<{ id: string }>(
        "select public.assign_game_team($1,$2) id",
        [teamA, participant],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ id: string }>(
          "select public.assign_game_team($1,$2) id",
          [teamA, participant],
        )
      ).rows[0].id,
    ).toBe(first);
    await expect(
      db.query("select public.assign_game_team($1,$2)", [teamA, second]),
    ).rejects.toThrow("Team capacity");
    await db.query("select public.assign_game_team($1,$2)", [
      teamB,
      participant,
    ]);
    expect(
      (
        await db.query(
          "select id from public.game_team_members where ended_at is null",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select id from public.game_team_members")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select id from public.game_scores")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.participant_requirements")).rows,
    ).toHaveLength(0);
  });
  it("blocks foreign participants, withdrawn consent, raw changes and participant roster reads", async () => {
    await expect(
      db.query("select public.assign_game_team($1,$2)", [
        teamB,
        "60000000-0000-4000-8000-000000000002",
      ]),
    ).rejects.toThrow("Active consented participant");
    await db.exec("reset role");
    await db.query(
      "update public.tlt_participants set consent_state='withdrawn' where id=$1",
      [second],
    );
    await asUser(db, ids.director);
    await expect(
      db.query("select public.assign_game_team($1,$2)", [teamB, second]),
    ).rejects.toThrow("Active consented participant");
    await expect(
      db.query("delete from public.game_team_members"),
    ).rejects.toThrow("permission denied");
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.game_team_members")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.game_teams")).rows,
    ).toHaveLength(0);
  });
  it("records removals idempotently and freezes team changes after session closure", async () => {
    await asUser(db, ids.director);
    await db.query("select public.end_game_team_membership($1,$2)", [
      session,
      participant,
    ]);
    await db.query("select public.end_game_team_membership($1,$2)", [
      session,
      participant,
    ]);
    expect(
      (
        await db.query(
          "select id from public.game_team_members where ended_at is null",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.game_team_members")).rows,
    ).toHaveLength(2);
    await db.query("select public.close_game_session($1)", [session]);
    await expect(
      db.query("select public.create_game_team($1,'Closed',6)", [session]),
    ).rejects.toThrow("Session closed");
    await expect(
      db.query("select public.assign_game_team($1,$2)", [teamB, participant]),
    ).rejects.toThrow("open session");
    await expect(
      db.query("select public.end_game_team_membership($1,$2)", [
        session,
        participant,
      ]),
    ).rejects.toThrow("Session closed");
  });
});
