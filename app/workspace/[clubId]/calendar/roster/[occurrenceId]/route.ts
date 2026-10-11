import { NextResponse } from "next/server";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { csvDocument } from "@/lib/validation/csv";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubId: string; occurrenceId: string }> },
) {
  const { clubId, occurrenceId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(occurrenceId).success)
    return new NextResponse(null, { status: 404 });
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => r !== "participant"))
    return new NextResponse(null, { status: 403 });
  const occurrence = await db
    .from("calendar_occurrences")
    .select("id,event_id,starts_at")
    .eq("club_id", clubId)
    .eq("id", occurrenceId)
    .maybeSingle();
  if (occurrence.error) throw new Error("Unable to load event.");
  if (!occurrence.data) return new NextResponse(null, { status: 404 });
  const rows: unknown[][] = [
    ["Occurrence ID", "Participant alias", "RSVP", "Updated at (UTC)"],
  ];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await db
      .from("event_rsvps")
      .select("participant_id,response,updated_at", { count: "exact" })
      .eq("club_id", clubId)
      .eq("occurrence_id", occurrenceId)
      .order("participant_id")
      .range(offset, offset + 499);
    if (result.error) throw new Error("Unable to load roster.");
    if ((result.count ?? 0) > 10000)
      return new NextResponse("Roster exceeds export limit", { status: 413 });
    if (result.data.length) {
      const people = await db
        .from("tlt_participants")
        .select("id,public_alias")
        .eq("club_id", clubId)
        .in(
          "id",
          result.data.map((r) => r.participant_id),
        );
      if (people.error) throw new Error("Unable to resolve roster.");
      const aliases = new Map(people.data.map((p) => [p.id, p.public_alias]));
      for (const r of result.data) {
        if (!aliases.has(r.participant_id))
          throw new Error("Incomplete roster scope.");
        rows.push([
          occurrenceId,
          aliases.get(r.participant_id),
          r.response,
          r.updated_at,
        ]);
      }
    }
    if (result.data.length < 500) break;
  }
  const audit = await db.rpc("log_calendar_export", {
    target_club: clubId,
    export_format: "roster_csv",
    target_occurrence: occurrenceId,
  });
  if (audit.error) throw new Error("Unable to audit roster export.");
  return new NextResponse(csvDocument(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tlt-event-roster.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
