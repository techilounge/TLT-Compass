import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import { expandEvent } from "../../modules/calendar/events";
const participant = "60000000-0000-4000-8000-000000000001";
describe("reviewed calendar publishing", () => {
  let db: TestDatabase;
  let draft: string;
  let event: string;
  let occurrence: string;
  const payload = expandEvent({
    title: "Supervised meeting",
    timezone: "America/Chicago",
    start_local: "2027-01-10T10:00",
    end_local: "2027-01-10T11:00",
  });
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("requires manager MFA and rejects foreign scope and invalid intervals", async () => {
    await asUser(db, ids.director, "aal1");
    await expect(
      db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
        randomUUID(),
        ids.north,
        payload,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.otherDirector);
    await expect(
      db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
        randomUUID(),
        ids.north,
        payload,
      ]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    await expect(
      db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
        randomUUID(),
        ids.north,
        {
          ...payload,
          occurrences: [
            { starts_at: "2027-01-10T12:00Z", ends_at: "2027-01-10T11:00Z" },
          ],
        },
      ]),
    ).rejects.toThrow("Invalid or overlapping");
    draft = randomUUID();
    await db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
      draft,
      ids.north,
      payload,
    ]);
    await db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
      draft,
      ids.north,
      payload,
    ]);
    expect(
      (await db.query("select id from public.calendar_events")).rows,
    ).toHaveLength(0);
  });
  it("keeps drafts private and publishes only by explicit human action", async () => {
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.calendar_drafts")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.publish_calendar_draft($1,false)", [draft]),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    event = (
      await db.query<{ id: string }>(
        "select public.publish_calendar_draft($1,false) id",
        [draft],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ id: string }>(
          "select public.publish_calendar_draft($1,false) id",
          [draft],
        )
      ).rows[0].id,
    ).toBe(event);
    occurrence = (
      await db.query<{ id: string }>(
        "select id from public.calendar_occurrences where event_id=$1",
        [event],
      )
    ).rows[0].id;
  });
  it("detects overlaps and requires reviewed override", async () => {
    const id = randomUUID();
    await db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
      id,
      ids.north,
      { ...payload, title: "Another meeting" },
    ]);
    expect(
      (
        await db.query("select * from public.calendar_draft_conflicts($1)", [
          id,
        ])
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select public.publish_calendar_draft($1,false)", [id]),
    ).rejects.toThrow("Review calendar conflicts");
    await db.query("select public.publish_calendar_draft($1,true)", [id]);
  });
  it("protects revisions, preserves RSVP identity and rejects foreign RSVP", async () => {
    await asUser(db, ids.teen);
    await db.query("select public.respond_event($1,$2,'yes')", [
      occurrence,
      participant,
    ]);
    await expect(
      db.query(
        "select public.respond_event($1,'60000000-0000-4000-8000-000000000002','yes')",
        [occurrence],
      ),
    ).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    const id = randomUUID(),
      stale = randomUUID();
    await db.query("select public.save_calendar_draft($1,$2,$3,$4,1)", [
      id,
      ids.north,
      { ...payload, title: "Revised meeting" },
      event,
    ]);
    await db.query("select public.save_calendar_draft($1,$2,$3,$4,1)", [
      stale,
      ids.north,
      { ...payload, title: "Stale revision" },
      event,
    ]);
    await db.query("select public.publish_calendar_draft($1,true)", [id]);
    await expect(
      db.query("select public.publish_calendar_draft($1,true)", [stale]),
    ).rejects.toThrow("Event revision changed");
    expect(
      (
        await db.query<{ id: string }>(
          "select id from public.calendar_occurrences where event_id=$1",
          [event],
        )
      ).rows[0].id,
    ).toBe(occurrence);
    expect(
      (
        await db.query(
          "select response from public.event_rsvps where occurrence_id=$1",
          [occurrence],
        )
      ).rows,
    ).toEqual([{ response: "yes" }]);
  });
  it("keeps staff events and other clubs hidden, and retains cancelled occurrences", async () => {
    const id = randomUUID();
    await db.query("select public.save_calendar_draft($1,$2,$3,null,0)", [
      id,
      ids.north,
      { ...payload, title: "Staff planning", visibility: "staff" },
    ]);
    await db.query("select public.publish_calendar_draft($1,true)", [id]);
    await asUser(db, ids.teen);
    expect(
      (
        await db.query(
          "select title from public.calendar_events where visibility='staff'",
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(db, ids.otherDirector);
    expect(
      (
        await db.query(
          "select id from public.calendar_events where club_id=$1",
          [ids.north],
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(db, ids.director);
    await db.query("select public.cancel_calendar_event($1,2)", [event]);
    await asUser(db, ids.teen);
    await expect(
      db.query("select public.respond_event($1,$2,'no')", [
        occurrence,
        participant,
      ]),
    ).rejects.toThrow("RSVP unavailable");
    expect(
      (
        await db.query(
          "select status from public.calendar_occurrences where id=$1",
          [occurrence],
        )
      ).rows,
    ).toEqual([{ status: "cancelled" }]);
  });
});
