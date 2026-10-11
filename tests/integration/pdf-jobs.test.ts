import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asUser, createTestDatabase, ids, type TestDatabase } from "./database";
import { candidatesFromPdfLines } from "../../modules/calendar/import-pdf";
describe("durable private PDF jobs", () => {
  let db: TestDatabase;
  let job: string;
  let token: string;
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  async function enqueue() {
    const id = randomUUID();
    await db.query(
      "select public.enqueue_pdf_calendar($1,$2,'synthetic.pdf',$3,$4,'UTC')",
      [
        id,
        ids.north,
        "b".repeat(64),
        Buffer.from(
          "%PDF-synthetic fixture, extraction not tested here",
        ).toString("base64"),
      ],
    );
    return id;
  }
  it("requires eligible manager and protects original bytes", async () => {
    await asUser(db, ids.director, "aal1");
    await expect(enqueue()).rejects.toThrow("Not authorized");
    await asUser(db, ids.director);
    job = await enqueue();
    await expect(
      db.query("select source_base64 from public.pdf_calendar_jobs"),
    ).rejects.toThrow("permission denied");
    await asUser(db, ids.teen);
    expect(
      (await db.query("select id from public.pdf_calendar_jobs")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select * from public.claim_pdf_calendar($1)", [job]),
    ).rejects.toThrow("Not authorized");
  });
  it("leases exactly one extraction and blocks forged completions", async () => {
    await asUser(db, ids.director);
    const claim = await db.query<{ lease_token: string }>(
      "select * from public.claim_pdf_calendar($1)",
      [job],
    );
    token = claim.rows[0].lease_token;
    expect(
      (await db.query("select * from public.claim_pdf_calendar($1)", [job]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.finish_pdf_calendar($1,$2,'[]',null)", [
        job,
        randomUUID(),
      ]),
    ).rejects.toThrow("lease expired");
  });
  it("finishes only into a private editable preview, never publishes", async () => {
    const candidates = candidatesFromPdfLines(
      [{ page: 2, lines: ["Meeting | 2026-10-20 | 10:00 | 11:00"] }],
      "UTC",
    );
    await db.query("select public.finish_pdf_calendar($1,$2,$3,null)", [
      job,
      token,
      JSON.stringify(candidates),
    ]);
    expect(
      (
        await db.query(
          "select status from public.pdf_calendar_jobs where id=$1",
          [job],
        )
      ).rows,
    ).toEqual([{ status: "needs_review" }]);
    expect(
      (
        await db.query(
          "select status,source_kind from public.calendar_imports where id=$1",
          [job],
        )
      ).rows,
    ).toEqual([{ status: "preview", source_kind: "pdf" }]);
    expect(
      (await db.query("select id from public.calendar_events")).rows,
    ).toHaveLength(0);
  });
  it("retains exact PDF page provenance after separate human publication", async () => {
    await db.query(
      "select public.publish_calendar_import($1,1,array[0],true)",
      [job],
    );
    const events = (
      await db.query<{ source_kind: string; source_reference: string }>(
        "select source_kind,source_reference from public.calendar_drafts where published_event_id is not null",
      )
    ).rows;
    expect(events).toHaveLength(1);
    expect(events[0].source_kind).toBe("pdf");
    expect(events[0].source_reference).toContain("PDF p. 2");
  });
});
