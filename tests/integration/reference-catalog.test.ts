import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import {
  catalogVersion,
  referenceCatalog,
} from "../../modules/program-rules/reference-catalog";
describe("referenced draft curriculum", () => {
  let db: TestDatabase, rule: string;
  const items = referenceCatalog.filter(
    (r) => r.department_code === "administrative",
  );
  beforeAll(async () => {
    db = await createTestDatabase();
    await asUser(db, ids.director);
    rule = (
      await db.query<{ id: string }>(
        "insert into public.program_rule_sets(club_id,version,source_title,minimum_grade,maximum_grade,minimum_attendance,recommendation_count,probation_days,require_prior_achievement) values($1,'draft-catalog','TLT Record Book',9,12,80,2,30,true) returning id",
        [ids.north],
      )
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("retains all eight departments and source markings without assigning levels automatically", () => {
    expect(referenceCatalog).toHaveLength(122);
    expect(items.filter((i) => i.requirement_type === "required")).toHaveLength(
      12,
    );
    expect(items.filter((i) => i.requirement_type === "optional")).toHaveLength(
      4,
    );
    expect(
      items.every(
        (i) =>
          i.source_page.includes("PDF p. 12") &&
          i.source_section.includes("TLT_RecordBook.pdf"),
      ),
    ).toBe(true);
  });
  it("imports once into an explicit draft level and preserves citation details", async () => {
    const args = [
      ids.north,
      rule,
      2,
      "administrative",
      catalogVersion,
      JSON.stringify(items),
    ];
    expect(
      (
        await db.query<{ count: number }>(
          "select public.import_requirement_catalog($1,$2,$3,$4,$5,$6) count",
          args,
        )
      ).rows[0].count,
    ).toBe(16);
    expect(
      (
        await db.query<{ count: number }>(
          "select public.import_requirement_catalog($1,$2,$3,$4,$5,$6) count",
          args,
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await db.query(
          "select id from public.program_requirements where rule_set_id=$1 and level=1",
          [rule],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.program_rule_sets where id=$1",
          [rule],
        )
      ).rows[0].status,
    ).toBe("draft");
  });
  it("rejects foreign scope and approved versions", async () => {
    await asUser(db, ids.otherDirector);
    await expect(
      db.query(
        "select public.import_requirement_catalog($1,$2,3,'administrative',$3,$4)",
        [ids.north, rule, catalogVersion, JSON.stringify(items)],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await db.query(
      "select public.approve_rule_version($1,'Supplied Record Book, reviewed for synthetic test')",
      [rule],
    );
    await expect(
      db.query(
        "select public.import_requirement_catalog($1,$2,3,'administrative',$3,$4)",
        [ids.north, rule, catalogVersion, JSON.stringify(items)],
      ),
    ).rejects.toThrow("Draft rule");
  });
});
