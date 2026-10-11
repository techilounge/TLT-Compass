import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
describe("draft requirement corrections", () => {
  let db: TestDatabase, rule: string, requirement: string;
  const payload = {
    level: 2,
    department_code: "activities",
    requirement_type: "optional",
    description: "Reviewed task wording",
    source_page: "12",
    source_section: "Director reviewed source",
  };
  beforeAll(async () => {
    db = await createTestDatabase();
    await asUser(db, ids.director);
    rule = (
      await db.query<{ id: string }>(
        "insert into public.program_rule_sets(club_id,version,source_title,minimum_grade,maximum_grade,minimum_attendance,recommendation_count,probation_days,require_prior_achievement) values($1,'editable','Synthetic',9,12,80,2,30,true) returning id",
        [ids.north],
      )
    ).rows[0].id;
    requirement = (
      await db.query<{ id: string }>(
        "insert into public.program_requirements(club_id,rule_set_id,level,department_code,requirement_type,description,source_page,source_section) values($1,$2,1,'administrative','required','Original','1','Synthetic') returning id",
        [ids.north, rule],
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("rejects foreign managers and direct updates", async () => {
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.edit_draft_requirement($1,0,$2)", [
        requirement,
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query(
        "update public.program_requirements set description='bypass' where id=$1",
        [requirement],
      ),
    ).rejects.toThrow();
  });
  it("retains immutable before/after revisions and rejects stale writes", async () => {
    await db.query("select public.edit_draft_requirement($1,0,$2)", [
      requirement,
      JSON.stringify(payload),
    ]);
    const history = await db.query<{
      before_value: { description: string };
      after_value: { description: string };
    }>(
      "select before_value,after_value from public.requirement_draft_revisions where requirement_id=$1",
      [requirement],
    );
    expect(history.rows[0].before_value.description).toBe("Original");
    expect(history.rows[0].after_value.description).toBe(payload.description);
    await expect(
      db.query("select public.edit_draft_requirement($1,0,$2)", [
        requirement,
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Draft changed");
    await expect(
      db.query(
        "delete from public.requirement_draft_revisions where requirement_id=$1",
        [requirement],
      ),
    ).rejects.toThrow();
  });
  it("rejects identity injection and all edits after approval", async () => {
    await expect(
      db.query("select public.edit_draft_requirement($1,1,$2)", [
        requirement,
        JSON.stringify({ ...payload, club_id: ids.cedar }),
      ]),
    ).rejects.toThrow("Invalid draft fields");
    await db.query(
      "select public.approve_rule_version($1,'Synthetic source reviewed')",
      [rule],
    );
    await expect(
      db.query("select public.edit_draft_requirement($1,1,$2)", [
        requirement,
        JSON.stringify(payload),
      ]),
    ).rejects.toThrow("Draft rule version required");
  });
});
