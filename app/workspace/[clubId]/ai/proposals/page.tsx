import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { Field, SaveButton } from "@/components/workspace/forms";
import { CalendarTimezone } from "@/components/workspace/calendar-timezone";
import { proposeEvent } from "./actions";
export default async function ProposalsPage({
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
    redirect(`/workspace/${clubId}/ai`);
  const proposals = await db
    .from("ai_proposals")
    .select("id,status,created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (proposals.error) throw new Error("Unable to load proposals");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/ai`}>← AI Integration</Link>
      <h1>AI event proposals</h1>
      {(await searchParams).notice && (
        <p role="alert">
          A proposal could not be prepared. Provide explicit dates, times and
          timezone; verify AI configuration and budget.
        </p>
      )}
      <p>
        Proposals require human approval to create a private calendar draft.
        Publishing is a separate reviewed calendar action. Manual calendar
        editing remains available.
      </p>
      <form
        action={proposeEvent.bind(null, clubId)}
        className="panel grid gap-4"
      >
        <Field label="Event details with explicit start and end date/time">
          <textarea
            name="description"
            minLength={10}
            maxLength={4000}
            required
          />
        </Field>
        <CalendarTimezone fallback={club.timezone} />
        <label>
          <input type="checkbox" name="confirmed" required /> Send these event
          details to the configured privacy-approved AI provider. I have
          excluded personal information.
        </label>
        <SaveButton>Prepare proposal</SaveButton>
      </form>
      <ul>
        {(proposals.data ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/workspace/${clubId}/ai/proposals/${p.id}`}>
              {p.created_at} · {p.status}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
