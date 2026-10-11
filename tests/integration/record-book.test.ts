import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const rule = "30000000-0000-4000-8000-000000000001";
const requirement = "40000000-0000-4000-8000-000000000001";
const foreignRequirement = "40000000-0000-4000-8000-000000000002";
const participant = "60000000-0000-4000-8000-000000000001";
describe("record-book operational slice", () => {
  let db: TestDatabase;
  let task: string;
  let firstSubmission: string;
  let finalSubmission: string;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("keeps clubs, participants, rules and requirements isolated", async () => {
    await asUser(db, ids.director);
    expect(
      (await db.query("select id from public.tlt_participants")).rows,
    ).toEqual([{ id: participant }]);
    expect(
      (await db.query("select id from public.program_requirements")).rows,
    ).toEqual([{ id: requirement }]);
    await expect(
      db.query(
        "insert into public.seasons(club_id,name,starts_on,ends_on,rule_set_id) values($1,'bad',current_date,current_date,$2)",
        [ids.north, "30000000-0000-4000-8000-000000000002"],
      ),
    ).rejects.toThrow();
  });
  it("does not admit or assign tasks against unapproved rules", async () => {
    await asUser(db, ids.director);
    await expect(
      db.query("select public.admit_participant($1)", [participant]),
    ).rejects.toThrow("Onboarding prerequisites");
    await expect(
      db.query("select public.create_task($1,$2,'demo','instructions',null)", [
        participant,
        requirement,
      ]),
    ).rejects.toThrow("Active participant");
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.approve_rule_version($1,'synthetic reference')", [
        rule,
      ]),
    ).rejects.toThrow("Not authorized");
  });
  it("requires an eligible primary mentor before admission", async () => {
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version($1,'Synthetic test source; no official completion claim')",
      [rule],
    );
    await expect(
      db.query("select public.admit_participant($1)", [participant]),
    ).rejects.toThrow("Onboarding prerequisites");
    await expect(
      db.query("select public.assign_mentor($1,$2,'primary',null)", [
        participant,
        ids.otherDirector,
      ]),
    ).rejects.toThrow("Eligible adult mentor");
    await db.query("select public.assign_mentor($1,$2,'primary',null)", [
      participant,
      ids.mentor,
    ]);
    await db.query("select public.admit_participant($1)", [participant]);
    expect(
      (
        await db.query(
          "select status,admitted_by from public.tlt_participants where id=$1",
          [participant],
        )
      ).rows,
    ).toEqual([{ status: "active", admitted_by: ids.director }]);
  });
  it("freezes approved requirements and retains rule history", async () => {
    await db.exec("reset role");
    await expect(
      db.query(
        "update public.program_rule_sets set minimum_attendance=0 where id=$1",
        [rule],
      ),
    ).rejects.toThrow("new rule version");
    await expect(
      db.query(
        "update public.program_requirements set description='rewritten' where id=$1",
        [requirement],
      ),
    ).rejects.toThrow("immutable");
    await asUser(db, ids.director);
  });
  it("assigns a scoped task and rejects foreign requirements", async () => {
    await expect(
      db.query("select public.create_task($1,$2,'bad','bad',null)", [
        participant,
        foreignRequirement,
      ]),
    ).rejects.toThrow("Active participant");
    const result = await db.query<{ id: string }>(
      "select public.create_task_draft($1,$2,'Plan supervised service','Explain your plan and ask your mentor to review.',current_date+7) as id",
      [participant, requirement],
    );
    task = result.rows[0].id;
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.tasks where id=$1", [task])).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.transition_task($1,'draft','assigned')", [task]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query("select public.transition_task($1,'draft','assigned')", [
      task,
    ]);
    await asUser(db, ids.teen);
    await db.query(
      "select public.transition_task($1,'assigned','in_progress')",
      [task],
    );
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select * from public.tasks where id=$1", [task])).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.submit_task($1,'forged','forged',current_date)", [
        task,
      ]),
    ).rejects.toThrow("Not authorized");
  });
  it("versions participant evidence and prevents self-approval", async () => {
    await asUser(db, ids.teen);
    firstSubmission = (
      await db.query<{ id: string }>(
        "select public.submit_task($1,'My supervised plan','I learned to share responsibilities.',current_date) as id",
        [task],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "select public.review_submission($1,'verified','self approved')",
        [firstSubmission],
      ),
    ).rejects.toThrow("Not authorized");
    await expect(
      db.query(
        "select public.submit_task($1,'duplicate','duplicate',current_date)",
        [task],
      ),
    ).rejects.toThrow("cannot be submitted");
  });
  it("requests changes and accepts a new evidence version", async () => {
    await asUser(db, ids.mentor);
    await db.query(
      "select public.review_submission($1,'changes_requested','Add the supervisor and a clear activity plan.')",
      [firstSubmission],
    );
    expect(
      (await db.query("select * from public.participant_requirements")).rows,
    ).toHaveLength(0);
    await asUser(db, ids.teen);
    finalSubmission = (
      await db.query<{ id: string }>(
        "select public.submit_task($1,'Revised plan: mentor supervises and assigns teams.','I clarified team responsibilities.',current_date) as id",
        [task],
      )
    ).rows[0].id;
    expect(
      (
        await db.query(
          "select version_no from public.task_submissions where task_id=$1 order by version_no",
          [task],
        )
      ).rows,
    ).toEqual([{ version_no: 1 }, { version_no: 2 }]);
  });
  it("rejects stale/foreign reviews, then signs exactly one official checklist record", async () => {
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.review_submission($1,'verified','stale')", [
        firstSubmission,
      ]),
    ).rejects.toThrow("cannot be reviewed");
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.review_submission($1,'verified','cross club')", [
        finalSubmission,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.mentor);
    await db.query(
      "select public.review_submission($1,'verified','Reviewed together; evidence meets the synthetic exercise.')",
      [finalSubmission],
    );
    const result = await db.query<{ completed_at: string }>(
      "select rule_set_id,reviewed_by,completed_at from public.participant_requirements where participant_id=$1",
      [participant],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rule_set_id: rule,
      reviewed_by: ids.mentor,
    });
    expect(result.rows[0].completed_at).toBeTruthy();
    await expect(
      db.query("select public.review_submission($1,'verified','duplicate')", [
        finalSubmission,
      ]),
    ).rejects.toThrow("cannot be reviewed");
  });
  it("enforces lifecycle ownership, stale-state checks and immutable verification", async () => {
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.transition_task($1,'verified','closed')", [task]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.transition_task($1,'verified','closed')", [task]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.mentor);
    await expect(
      db.query("select public.transition_task($1,'submitted','closed')", [
        task,
      ]),
    ).rejects.toThrow("Task changed");
    await expect(
      db.query("select public.transition_task($1,'verified','cancelled')", [
        task,
      ]),
    ).rejects.toThrow("Invalid task transition");
    await db.query("select public.transition_task($1,'verified','closed')", [
      task,
    ]);
    expect(
      (
        await db.query(
          "select id from public.participant_requirements where participant_id=$1",
          [participant],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("prevents direct status or completion forgery and redacts private evidence from audit", async () => {
    await asUser(db, ids.teen);
    await expect(
      db.query("update public.tasks set status='verified' where id=$1", [task]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update public.tlt_participants set current_level=4 where id=$1",
        [participant],
      ),
    ).rejects.toThrow();
    await asUser(db, ids.director);
    const logs = await db.query("select details from public.audit_logs");
    expect(JSON.stringify(logs.rows)).not.toContain("Revised plan");
  });
});
