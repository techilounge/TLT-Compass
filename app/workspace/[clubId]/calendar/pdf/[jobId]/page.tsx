import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { PdfJobProgress } from "@/components/workspace/pdf-job-progress";
export default async function PdfJobPage({
  params,
}: {
  params: Promise<{ clubId: string; jobId: string }>;
}) {
  const { clubId, jobId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(jobId).success)
    notFound();
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/calendar`);
  const result = await db
    .from("pdf_calendar_jobs")
    .select("id,file_name,status,attempts,import_id,source_sha256")
    .eq("club_id", clubId)
    .eq("id", jobId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load PDF job.");
  if (!result.data) notFound();
  const job = result.data;
  if (job.import_id)
    redirect(`/workspace/${clubId}/calendar/import/${job.import_id}`);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-8 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/calendar/import`}>
        ← Calendar imports
      </Link>
      <h1 className="text-3xl font-bold">Extract {job.file_name}</h1>
      <p>
        {job.status} · attempt {job.attempts}/3
      </p>
      <PdfJobProgress
        clubId={clubId}
        jobId={jobId}
        status={job.status}
        attempts={job.attempts}
      />
      <p className="text-sm text-muted-foreground">
        Up to 5 MiB and 30 pages. Parsing is isolated and bounded.
        Scanned/uncertain schedules stay unresolved for manual correction; no
        event is published automatically.
      </p>
      <p className="break-all text-xs text-muted-foreground">
        Source SHA-256: {job.source_sha256}
      </p>
    </main>
  );
}
