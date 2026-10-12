import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { Field, Hidden, SaveButton } from "@/components/workspace/forms";
import { CalendarTimezone } from "@/components/workspace/calendar-timezone";
import { importColumns } from "@/modules/calendar/import-csv";
import { saveImport } from "./actions";
import { uploadPdfCalendar } from "../pdf/actions";
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/calendar`);
  const q = await searchParams;
  const jobs = await db
    .from("calendar_imports")
    .select("id,file_name,status,created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (jobs.error) throw new Error("Unable to load imports.");
  const pdfJobs = await db
    .from("pdf_calendar_jobs")
    .select("id,file_name,status")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (pdfJobs.error) throw new Error("Unable to load PDF jobs.");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-8 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/calendar`}>← Calendar</Link>
      <header>
        <p className="eyebrow">{club.name} · Staff only</p>
        <h1 className="mt-3 text-3xl font-bold">Import calendar</h1>
        <p className="mt-3 text-muted-foreground">
          Upload → map columns → edit and review → publish. Missing dates stay
          unresolved. File contents are data, never instructions.
        </p>
      </header>
      {q.notice && (
        <p role="status" className="notice">
          Unable to import. Use UTF-8 CSV up to 512 KiB (500 rows) or a valid
          PDF up to 5 MiB, with an IANA timezone.
        </p>
      )}
      <form action={saveImport.bind(null, clubId)} className="panel space-y-5">
        <Hidden name="operation" value="upload" />
        <Hidden name="request_id" value={randomUUID()} />
        <Field label="Calendar CSV">
          <input name="file" type="file" accept=".csv,text/csv" required />
        </Field>
        <Field label="Delimiter">
          <select name="delimiter">
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            <option value="tab">Tab</option>
          </select>
        </Field>
        <CalendarTimezone fallback={club.timezone} />
        <p className="text-sm text-muted-foreground">
          The selected timezone is an explicit fallback for rows without a
          timezone column. Use ISO local dates and times (YYYY-MM-DDTHH:mm);
          all-day end dates are exclusive. Do not include confidential youth
          details.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {importColumns.map((c) => (
            <Field
              key={c}
              label={`${c} column${["title", "start", "end"].includes(c) ? " (required)" : " (optional)"}`}
            >
              <input name={`map_${c}`} maxLength={100} defaultValue={c} />
            </Field>
          ))}
        </div>
        <SaveButton>Create import preview</SaveButton>
      </form>
      <section className="panel space-y-5">
        <h2 className="text-xl font-bold">Extract a PDF schedule</h2>
        <p className="text-sm text-muted-foreground">
          Private durable upload, bounded text extraction, then editable
          source-page review. Scanned PDF OCR/vision is not enabled yet.
        </p>
        <form
          action={uploadPdfCalendar.bind(null, clubId)}
          className="space-y-4"
        >
          <Hidden name="request_id" value={randomUUID()} />
          <Field label="Calendar PDF (up to 5 MiB, 30 pages)">
            <input
              name="file"
              type="file"
              accept=".pdf,application/pdf"
              required
            />
          </Field>
          <CalendarTimezone fallback={club.timezone} />
          <SaveButton>Upload PDF for extraction</SaveButton>
        </form>
      </section>
      <section className="panel">
        <h2 className="text-xl font-bold">Saved PDF extraction jobs</h2>
        <ul className="mt-4 space-y-3">
          {pdfJobs.data.map((j) => (
            <li key={j.id}>
              <Link
                className="text-primary underline"
                href={`/workspace/${clubId}/calendar/pdf/${j.id}`}
              >
                {j.file_name} · {j.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="text-xl font-bold">Recent imports</h2>
        <ul className="mt-4 space-y-3">
          {jobs.data.map((j) => (
            <li key={j.id}>
              <Link
                className="text-primary underline"
                href={`/workspace/${clubId}/calendar/import/${j.id}`}
              >
                {j.file_name} · {j.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
