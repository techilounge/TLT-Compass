import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const participant = "60000000-0000-4000-8000-000000000001",
  rule = "30000000-0000-4000-8000-000000000001",
  requirement = "40000000-0000-4000-8000-000000000001";
describe("scope and workflow regression guards", () => {
  let db: TestDatabase;
  let task: string;
  beforeAll(async () => {
    db = await createTestDatabase();
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version($1,'Synthetic source only')",
      [rule],
    );
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await db.query("select public.admit_participant($1)", [participant]);
    task = (
      await db.query<{ id: string }>(
        "select public.create_task($1,$2,'Synthetic plan','Synthetic instructions',null) as id",
        [participant, requirement],
      )
    ).rows[0].id;
    await db.exec("reset role");
  }, 60000);
  beforeEach(async () => {
    await db.exec("begin");
    await asUser(db, ids.director);
  });
  afterEach(async () => {
    await db.exec("rollback; reset role");
  });
  afterAll(async () => {
    await db?.close();
  });
  it("rejects foreign profile links even for a director", async () => {
    await expect(
      db.query(
        "insert into public.tlt_participants(club_id,season_id,profile_id,public_alias,grade_level) values($1,$2,$3,'bad link',9)",
        [ids.north, "50000000-0000-4000-8000-000000000001", ids.otherDirector],
      ),
    ).rejects.toThrow("must belong to this club");
  });
  it("retains same-day mentor assignment history", async () => {
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.director,
    ]);
    const rows = (
      await db.query<{ state: string; mentor_profile_id: string }>(
        "select state,mentor_profile_id from public.mentor_assignments where participant_id=$1 order by state",
        [participant],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.state === "ended")?.mentor_profile_id).toBe(
      ids.mentor,
    );
    await asUser(db, ids.mentor);
    expect(
      (
        await db.query("select * from public.tlt_participants where id=$1", [
          participant,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("an old primary role does not survive a switch to operational-only membership", async () => {
    await db.exec("reset role");
    await db.query(
      "update public.club_memberships set status='revoked' where club_id=$1 and profile_id=$2",
      [ids.north, ids.mentor],
    );
    await db.query(
      "insert into public.club_memberships(club_id,profile_id,role) values($1,$2,'operational_mentor')",
      [ids.north, ids.mentor],
    );
    await asUser(db, ids.mentor);
    expect(
      (await db.query("select * from public.tlt_participants")).rows,
    ).toHaveLength(0);
  });
  it("screening revocation immediately removes mentor access", async () => {
    await db.exec("reset role");
    await db.query(
      "update public.staff_eligibility set eligible=false where club_id=$1 and profile_id=$2",
      [ids.north, ids.mentor],
    );
    await asUser(db, ids.mentor);
    expect((await db.query("select * from public.tasks")).rows).toHaveLength(0);
  });
  it("does not allow duplicate requirement assignments", async () => {
    await expect(
      db.query(
        "select public.create_task($1,$2,'duplicate','duplicate',null)",
        [participant, requirement],
      ),
    ).rejects.toThrow();
  });
  it("does not accept evidence after consent withdrawal", async () => {
    await db.query(
      "update public.tlt_participants set consent_state='withdrawn' where id=$1",
      [participant],
    );
    await asUser(db, ids.teen);
    await expect(
      db.query(
        "select public.submit_task($1,'example','example',current_date)",
        [task],
      ),
    ).rejects.toThrow("cannot be submitted");
  });
  it("requires mentor assignment to match rotation participant and department", async () => {
    const assignment = (
      await db.query<{ id: string }>(
        "select id from public.mentor_assignments where participant_id=$1",
        [participant],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "select public.create_rotation($1,$2,'outreach',current_date,current_date+7)",
        ["60000000-0000-4000-8000-000000000002", assignment],
      ),
    ).rejects.toThrow("Not authorized");
  });
  it("records and reviews a rotation once", async () => {
    const assignment = (
      await db.query<{ id: string }>(
        "select id from public.mentor_assignments where participant_id=$1",
        [participant],
      )
    ).rows[0].id;
    const rotation = (
      await db.query<{ id: string }>(
        "select public.create_rotation($1,$2,'outreach',current_date,current_date+7) as id",
        [participant, assignment],
      )
    ).rows[0].id;
    await asUser(db, ids.mentor);
    await db.query("select public.review_rotation($1)", [rotation]);
    expect(
      (
        await db.query(
          "select status,reviewed_by from public.rotations where id=$1",
          [rotation],
        )
      ).rows,
    ).toEqual([{ status: "reviewed", reviewed_by: ids.mentor }]);
    await expect(
      db.query("select public.review_rotation($1)", [rotation]),
    ).rejects.toThrow("already reviewed");
  });
  it("rejects invalid IANA timezones", async () => {
    await expect(
      db.query(
        "update public.clubs set timezone='not/a/timezone' where id=$1",
        [ids.north],
      ),
    ).rejects.toThrow("IANA timezone");
  });
});
