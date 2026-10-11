import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import {
  defaultMapping,
  parseCalendarCsv,
} from "../../modules/calendar/import-csv";
import { expandEvent } from "../../modules/calendar/events";
const source =
  "title,start,end\nFirst,2027-02-10T10:00,2027-02-10T11:00\nSecond,,";
describe("atomic calendar import review and rollback", () => {
  let db: TestDatabase;
  let job: string;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  async function create() {
    const id = randomUUID();
    await db.query(
      "select public.create_calendar_import($1,$2,'synthetic.csv',$3,$4,$5,$6)",
      [
        id,
        ids.north,
        "a".repeat(64),
        source,
        defaultMapping,
        JSON.stringify(parseCalendarCsv(source, defaultMapping, "UTC")),
      ],
    );
    return id;
  }
  it("isolates private originals and denies foreign and participant imports", async () => {
    await asUser(db, ids.otherDirector);
    await expect(create()).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    job = await create();
    await asUser(db, ids.teen);
    expect(
      (await db.query("select original_source from public.calendar_imports"))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.publish_calendar_import($1,1,array[0],true)", [
        job,
      ]),
    ).rejects.toThrow("Not authorized");
  });
  it("rolls back all event writes when a selected row is unresolved", async () => {
    await asUser(db, ids.director);
    await expect(
      db.query("select public.publish_calendar_import($1,1,array[0,1],true)", [
        job,
      ]),
    ).rejects.toThrow("Correct or deselect invalid rows");
    expect(
      (await db.query("select id from public.calendar_events")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.calendar_drafts")).rows,
    ).toHaveLength(0);
  });
  it("requires exact preview revision and human confirmation after editing", async () => {
    const payload = expandEvent({
      title: "Second",
      start_local: "2027-02-11T10:00",
      end_local: "2027-02-11T11:00",
      timezone: "UTC",
    });
    await db.query("select public.edit_calendar_import_row($1,1,1,$2)", [
      job,
      payload,
    ]);
    await expect(
      db.query("select public.publish_calendar_import($1,1,array[0,1],true)", [
        job,
      ]),
    ).rejects.toThrow("Select and review");
    await expect(
      db.query("select public.publish_calendar_import($1,2,array[0,1],false)", [
        job,
      ]),
    ).rejects.toThrow("Select and review");
    const r = await db.query<{ count: number }>(
      "select public.publish_calendar_import($1,2,array[0,1],true) count",
      [job],
    );
    expect(r.rows[0].count).toBe(2);
    expect(
      (
        await db.query<{ count: number }>(
          "select public.publish_calendar_import($1,2,array[0,1],true) count",
          [job],
        )
      ).rows[0].count,
    ).toBe(2);
  });
  it("blocks exact duplicates in existing published calendar", async () => {
    const duplicate = await create();
    await expect(
      db.query("select public.publish_calendar_import($1,1,array[0],true)", [
        duplicate,
      ]),
    ).rejects.toThrow("Duplicate published event");
    expect(
      (await db.query("select id from public.calendar_events")).rows,
    ).toHaveLength(2);
  });
  it("rolls back only unchanged imported events while preserving records", async () => {
    await db.query("select public.rollback_calendar_import($1)", [job]);
    expect(
      (await db.query("select status from public.calendar_events")).rows,
    ).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
    expect(
      (await db.query("select id from public.calendar_occurrences")).rows,
    ).toHaveLength(2);
    const other = await create();
    await db.query(
      "select public.publish_calendar_import($1,1,array[0],true)",
      [other],
    );
    const event = (
      await db.query<{ id: string }>(
        "select event_id id from public.calendar_import_events where import_id=$1",
        [other],
      )
    ).rows[0].id;
    await db.query("select public.cancel_calendar_event($1,1)", [event]);
    await expect(
      db.query("select public.rollback_calendar_import($1)", [other]),
    ).rejects.toThrow("Imported events changed");
  });
});
