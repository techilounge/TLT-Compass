import { NextResponse } from "next/server";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { csvDocument } from "@/lib/validation/csv";
import { loadRecordRows, RecordExportError } from "@/lib/exports/record";
import { recordPdf } from "@/lib/pdf/record";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubId: string; participantId: string }> },
) {
  const { clubId, participantId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(participantId).success)
    return new NextResponse(null, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "pdf")
    return new NextResponse("Unsupported format", { status: 400 });
  const { db, club } = await requireClub(clubId);
  try {
    const rows = await loadRecordRows(db, club, participantId);
    if (format === "pdf" && rows.length > 2500)
      throw new RecordExportError("Record exceeds PDF limit; use CSV.", 413);
    const body =
      format === "pdf"
        ? new Uint8Array(await recordPdf(rows))
        : csvDocument(rows);
    const audit = await db.rpc("log_record_export", {
      target_participant: participantId,
      export_format: format,
    });
    if (audit.error) throw new RecordExportError("Unable to audit export", 500);
    return new NextResponse(body, {
      headers: {
        "Content-Type":
          format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tlt-record-${participantId}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof RecordExportError)
      return new NextResponse(error.message, { status: error.status });
    return new NextResponse("Unable to generate record", { status: 500 });
  }
}
