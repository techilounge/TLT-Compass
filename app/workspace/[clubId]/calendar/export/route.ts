import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { loadCalendarItems } from "@/modules/calendar/read";
import { calendarIcs } from "@/modules/calendar/ical";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubId: string }> },
) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success)
    return new NextResponse(null, { status: 404 });
  const { db } = await requireClub(clubId);
  const q = new URL(request.url).searchParams;
  const from = z.iso.datetime().safeParse(q.get("from")),
    to = z.iso.datetime().safeParse(q.get("to"));
  if (
    !from.success ||
    !to.success ||
    Date.parse(to.data) <= Date.parse(from.data) ||
    Date.parse(to.data) - Date.parse(from.data) > 366 * 86400000
  )
    return new NextResponse(
      "Choose a positive calendar window of at most 366 days.",
      { status: 400 },
    );
  const items = await loadCalendarItems(db, clubId, from.data, to.data);
  const audit = await db.rpc("log_calendar_export", {
    target_club: clubId,
    export_format: "ics",
    target_occurrence: null,
  });
  if (audit.error)
    return new NextResponse("Unable to audit export", { status: 500 });
  return new NextResponse(calendarIcs(items), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tlt-calendar.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
