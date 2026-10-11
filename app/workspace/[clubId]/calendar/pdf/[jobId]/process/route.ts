import { NextResponse } from "next/server";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { extractCalendarPdf } from "@/lib/pdf/extract-calendar";
import { candidatesFromPdfLines } from "@/modules/calendar/import-pdf";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubId: string; jobId: string }> },
) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new NextResponse(null, { status: 403 });
  const { clubId, jobId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(jobId).success)
    return new NextResponse(null, { status: 404 });
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    return new NextResponse(null, { status: 403 });
  const scoped = await db
    .from("pdf_calendar_jobs")
    .select("id")
    .eq("club_id", clubId)
    .eq("id", jobId)
    .maybeSingle();
  if (scoped.error || !scoped.data)
    return new NextResponse(null, { status: 404 });
  const claim = await db.rpc("claim_pdf_calendar", { target_job: jobId });
  if (claim.error)
    return new NextResponse("Unable to claim job", { status: 500 });
  const job = claim.data?.[0];
  if (!job)
    return new NextResponse("Job already processing, reviewed or exhausted", {
      status: 409,
    });
  try {
    const extracted = await extractCalendarPdf(job.source_base64);
    const candidates = candidatesFromPdfLines(extracted.pages, job.timezone);
    const complete = await db.rpc("finish_pdf_calendar", {
      target_job: jobId,
      token: job.lease_token,
      parsed_candidates: candidates,
      extraction_error: null,
    });
    if (complete.error) throw new Error("Unable to complete job");
    return NextResponse.json(
      { importId: complete.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    await db.rpc("finish_pdf_calendar", {
      target_job: jobId,
      token: job.lease_token,
      parsed_candidates: null,
      extraction_error: "extraction_failed",
    });
    return new NextResponse(
      "Unable to extract this PDF. Review limits or enter the schedule manually.",
      { status: 422 },
    );
  }
}
