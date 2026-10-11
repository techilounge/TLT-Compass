import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
const season = "50000000-0000-4000-8000-000000000001";
const participant = "60000000-0000-4000-8000-000000000001";
describe("reviewed attendance and independent uniform measures", () => {
  let db: TestDatabase;
  let session: string;
  let entry: string;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("requires manager MFA, club scope and a past season date", async () => {
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query(
        "select public.create_attendance_session($1,$2,'Meeting',current_date-1,true,true,false,'present_only')",
        [ids.north, season],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.otherDirector);
    await expect(
      db.query(
        "select public.create_attendance_session($1,$2,'Meeting',current_date-1,true,true,false,'present_only')",
        [ids.north, season],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query(
        "select public.create_attendance_session($1,$2,'Future',current_date+3,true,true,false,'present_only')",
        [ids.north, season],
      ),
    ).rejects.toThrow("Session must");
    session = (
      await db.query<{ id: string }>(
        "select public.create_attendance_session($1,$2,'Meeting',current_date-1,true,true,false,'present_only') as id",
        [ids.north, season],
      )
    ).rows[0].id;
  });
  it("denies participant writes and foreign participant IDs", async () => {
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.record_attendance($1,$2,'present',true)", [
        session,
        participant,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query("select public.record_attendance($1,$2,'present',true)", [
        session,
        "60000000-0000-4000-8000-000000000002",
      ]),
    ).rejects.toThrow("Participant season");
    await expect(
      db.query("select public.record_attendance($1,$2,'present',null)", [
        session,
        participant,
      ]),
    ).rejects.toThrow("Uniform assessment");
    entry = (
      await db.query<{ id: string }>(
        "select public.record_attendance($1,$2,'present',false) as id",
        [session, participant],
      )
    ).rows[0].id;
  });
  it("does not count unreviewed records and keeps uniform separate", async () => {
    const pending = (
      await db.query("select * from public.attendance_summary($1)", [
        participant,
      ])
    ).rows[0];
    expect(Number(pending.attendance_denominator)).toBe(0);
    expect(Number(pending.pending_entries)).toBe(1);
    await db.query(
      "select public.verify_attendance(id,recorded_at) from public.attendance_entries where id=$1",
      [entry],
    );
    const verified = (
      await db.query("select * from public.attendance_summary($1)", [
        participant,
      ])
    ).rows[0];
    expect(Number(verified.attended)).toBe(1);
    expect(Number(verified.attendance_denominator)).toBe(1);
    expect(Number(verified.uniform_compliant)).toBe(0);
    expect(Number(verified.uniform_denominator)).toBe(1);
  });
  it("isolates reviewed records and summary by tenant", async () => {
    await asUser(db, ids.otherDirector);
    expect(
      (await db.query("select id from public.attendance_entries")).rows,
    ).toHaveLength(0);
    expect(
      Number(
        (
          await db.query("select * from public.attendance_summary($1)", [
            participant,
          ])
        ).rows[0].reviewed_entries,
      ),
    ).toBe(0);
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.attendance_entries")).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        "select public.verify_attendance(id,recorded_at) from public.attendance_entries",
      ),
    ).rejects.toThrow("Not authorized");
  });
  it("resets corrections to review, rejects stale review and excludes excused absences", async () => {
    await asUser(db, ids.director);
    const old = (
      await db.query(
        "select recorded_at from public.attendance_entries where id=$1",
        [entry],
      )
    ).rows[0].recorded_at;
    await db.query("select public.record_attendance($1,$2,'excused',null)", [
      session,
      participant,
    ]);
    await expect(
      db.query("select public.verify_attendance($1,$2)", [entry, old]),
    ).rejects.toThrow("Record changed");
    await db.query(
      "select public.verify_attendance(id,recorded_at) from public.attendance_entries where id=$1",
      [entry],
    );
    const summary = (
      await db.query("select * from public.attendance_summary($1)", [
        participant,
      ])
    ).rows[0];
    expect(Number(summary.attendance_denominator)).toBe(0);
    expect(Number(summary.uniform_denominator)).toBe(0);
    await expect(
      db.query("update public.attendance_entries set attendance='present'"),
    ).rejects.toThrow();
  });
  it("can count excused absences under explicit session policy", async () => {
    const required = (
      await db.query<{ id: string }>(
        "select public.create_attendance_session($1,$2,'Required meeting',current_date-1,true,true,true,'all_required') as id",
        [ids.north, season],
      )
    ).rows[0].id;
    await expect(
      db.query("select public.record_attendance($1,$2,'excused',null)", [
        required,
        participant,
      ]),
    ).rejects.toThrow("Uniform assessment");
    const e = (
      await db.query<{ id: string }>(
        "select public.record_attendance($1,$2,'excused',false) as id",
        [required, participant],
      )
    ).rows[0].id;
    await db.query(
      "select public.verify_attendance(id,recorded_at) from public.attendance_entries where id=$1",
      [e],
    );
    const summary = (
      await db.query("select * from public.attendance_summary($1)", [
        participant,
      ])
    ).rows[0];
    expect(Number(summary.attended)).toBe(0);
    expect(Number(summary.attendance_denominator)).toBe(1);
    expect(Number(summary.uniform_denominator)).toBe(1);
  });
});
