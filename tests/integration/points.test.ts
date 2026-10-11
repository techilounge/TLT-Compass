import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001";
const season = "50000000-0000-4000-8000-000000000001";
describe("immutable recognition and private rankings", () => {
  let db: TestDatabase;
  let rule: string;
  let quiz: string;
  let award: string;
  let source: string;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("requires eligible MFA manager to create rules and director to approve", async () => {
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query(
        "select public.create_point_rule($1,'Service','1','service',20,40,40,null)",
        [ids.north],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.otherDirector);
    await expect(
      db.query(
        "select public.create_point_rule($1,'Service','1','service',20,40,40,null)",
        [ids.north],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    rule = (
      await db.query<{ id: string }>(
        "select public.create_point_rule($1,'Service','1','service',20,40,40,null) id",
        [ids.north],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "select public.award_points($1,$2,$3,'manual',$4,'reviewed service')",
        [randomUUID(), participant, rule, randomUUID()],
      ),
    ).rejects.toThrow("Approved rule required");
    await db.query("select public.set_point_rule_status($1,'approved')", [
      rule,
    ]);
    quiz = (
      await db.query<{ id: string }>(
        "select public.create_point_rule($1,'Quiz','1','quiz',5,10,20,null) id",
        [ids.north],
      )
    ).rows[0].id;
    await db.query("select public.set_point_rule_status($1,'approved')", [
      quiz,
    ]);
  });
  it("enforces quiz share and source verification", async () => {
    await expect(
      db.query("select public.award_points($1,$2,$3,'manual',$4,'quiz')", [
        randomUUID(),
        participant,
        quiz,
        randomUUID(),
      ]),
    ).rejects.toThrow("Quiz contribution cap");
    await expect(
      db.query(
        "select public.award_points($1,$2,$3,'task_review',$4,'made up review')",
        [randomUUID(), participant, rule, randomUUID()],
      ),
    ).rejects.toThrow("Verified task review required");
    award = randomUUID();
    source = randomUUID();
    await db.query(
      "select public.award_points($1,$2,$3,'manual',$4,'reviewed service')",
      [award, participant, rule, source],
    );
    await db.query(
      "select public.award_points($1,$2,$3,'manual',$4,'reviewed quiz')",
      [randomUUID(), participant, quiz, randomUUID()],
    );
  });
  it("makes exact retries idempotent and prevents duplicate sources and monthly cap bypass", async () => {
    await db.query(
      "select public.award_points($1,$2,$3,'manual',$4,'reviewed service')",
      [award, participant, rule, source],
    );
    await expect(
      db.query(
        "select public.award_points($1,$2,$3,'manual',$4,'altered reason')",
        [award, participant, rule, source],
      ),
    ).rejects.toThrow("Request ID already used");
    await expect(
      db.query(
        "select public.award_points($1,$2,$3,'manual',$4,'duplicate source')",
        [randomUUID(), participant, rule, source],
      ),
    ).rejects.toThrow();
    await db.query(
      "select public.award_points($1,$2,$3,'manual',$4,'second service')",
      [randomUUID(), participant, rule, randomUUID()],
    );
    await expect(
      db.query(
        "select public.award_points($1,$2,$3,'manual',$4,'third service')",
        [randomUUID(), participant, rule, randomUUID()],
      ),
    ).rejects.toThrow("Award cap exceeded");
  });
  it("denies participants, foreign clubs, raw writes and ledger edits", async () => {
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.award_points($1,$2,$3,'manual',$4,'self')", [
        randomUUID(),
        participant,
        rule,
        randomUUID(),
      ]),
    ).rejects.toThrow("Not authorized");
    await expect(
      db.query("update public.points_ledger set points_delta=100"),
    ).rejects.toThrow();
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.points_ledger")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.reverse_points($1,$2,'foreign')", [
        randomUUID(),
        award,
      ]),
    ).rejects.toThrow("Not authorized");
    await db.exec("reset role");
    await expect(
      db.query("delete from public.points_ledger where id=$1", [award]),
    ).rejects.toThrow("immutable");
    await expect(
      db.query("truncate public.points_ledger cascade"),
    ).rejects.toThrow("immutable");
  });
  it("reverses exactly once with a director explanation and leaves original intact", async () => {
    await asUser(db, ids.director);
    const reversal = randomUUID();
    await db.query(
      "select public.reverse_points($1,$2,'duplicate activity discovered')",
      [reversal, award],
    );
    await db.query(
      "select public.reverse_points($1,$2,'duplicate activity discovered')",
      [reversal, award],
    );
    await expect(
      db.query("select public.reverse_points($1,$2,'again')", [
        randomUUID(),
        award,
      ]),
    ).rejects.toThrow();
    const values = await db.query<{ points_delta: number }>(
      "select points_delta from public.points_ledger where id=$1 or reversal_of=$1 order by points_delta",
      [award],
    );
    expect(values.rows.map((r) => r.points_delta)).toEqual([-20, 20]);
  });
  it("keeps rankings off until configured and consent-reviewed, allows immediate opt-out", async () => {
    expect(
      (
        await db.query(
          "select * from public.private_leaderboard($1,'all',null,null)",
          [ids.north],
        )
      ).rows,
    ).toHaveLength(0);
    await db.query("select public.configure_recognition($1,25,true)", [
      ids.north,
    ]);
    expect(
      (
        await db.query(
          "select * from public.private_leaderboard($1,'all',null,null)",
          [ids.north],
        )
      ).rows,
    ).toHaveLength(0);
    await db.query(
      "select public.approve_rule_version('30000000-0000-4000-8000-000000000001','Synthetic fixture')",
    );
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await db.query("select public.admit_participant($1)", [participant]);
    await db.query("select public.set_leaderboard_consent($1,true,true)", [
      participant,
    ]);
    const ranks = (
      await db.query<{ alias: string; points: string }>(
        "select * from public.private_leaderboard($1,'season',1,$2)",
        [ids.north, season],
      )
    ).rows;
    expect(ranks).toHaveLength(1);
    expect(ranks[0].alias).toBe("Trailblazer Demo");
    expect(Number(ranks[0].points)).toBe(25);
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select * from public.private_leaderboard($1,'all',null,null)", [
        ids.north,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.set_leaderboard_consent($1,true,true)", [
        participant,
      ]),
    ).rejects.toThrow("Director-confirmed");
    await db.query("select public.set_leaderboard_consent($1,false,false)", [
      participant,
    ]);
    expect(
      (
        await db.query(
          "select * from public.private_leaderboard($1,'month',null,null)",
          [ids.north],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("requires approved badge definitions and preserves revocation history", async () => {
    await asUser(db, ids.director);
    const badge = (
      await db.query<{ id: string }>(
        "select public.create_badge($1,'Collaboration','Helps peers during supervised activities') id",
        [ids.north],
      )
    ).rows[0].id;
    await db.query("select public.award_badge($1,$2,'supported the team')", [
      participant,
      badge,
    ]);
    const id = (
      await db.query<{ id: string }>(
        "select id from public.badge_awards where badge_id=$1",
        [badge],
      )
    ).rows[0].id;
    await db.query(
      "select public.revoke_badge($1,'incorrect participant selected')",
      [id],
    );
    await expect(
      db.query("select public.revoke_badge($1,'again')", [id]),
    ).rejects.toThrow("Revocation explanation");
    const result = (
      await db.query<{ revoked_at: string }>(
        "select revoked_at from public.badge_awards where id=$1",
        [id],
      )
    ).rows[0];
    expect(result.revoked_at).not.toBeNull();
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.create_badge($1,'Self','test')", [ids.north]),
    ).rejects.toThrow("Not authorized");
  });
});
