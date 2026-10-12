import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import type { EventPayload } from "@/modules/calendar/events";
import { Hidden } from "@/components/workspace/forms";
import { reviewProposal } from "../actions";
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ clubId: string; proposalId: string }>;
}) {
  const { clubId, proposalId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(proposalId).success)
    notFound();
  const { db, roles, user } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/ai`);
  const result = await db
    .from("ai_proposals")
    .select("*")
    .eq("club_id", clubId)
    .eq("id", proposalId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load proposal");
  if (!result.data) notFound();
  const proposal = result.data,
    p = proposal.payload as EventPayload;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/ai/proposals`}>← Proposals</Link>
      <h1>Review exact event proposal</h1>
      <p>
        Club {clubId} · Actor {user.email ?? user.id} · Action: create private
        calendar draft · {proposal.status}
      </p>
      <section className="panel">
        <h2>{p.title}</h2>
        <p>{p.description}</p>
        <p>
          {p.timezone} · {p.visibility} · {p.category} · {p.location} ·{" "}
          {p.organizer} · {p.all_day ? "All day, exclusive end" : "Timed event"}
        </p>
        <p>
          Recurrence: {p.recurrence.frequency} · {p.recurrence.count}{" "}
          occurrences
        </p>
        <ul>
          {p.occurrences.map((o) => (
            <li key={o.starts_at}>
              {o.starts_at} → {o.ends_at}
            </li>
          ))}
        </ul>
      </section>
      {proposal.status === "pending" && (
        <form
          action={reviewProposal.bind(null, clubId, proposalId)}
          className="panel grid gap-4"
        >
          <Hidden
            name="exact_payload"
            value={JSON.stringify(proposal.payload)}
          />
          <label>
            <input type="checkbox" name="confirmed" /> I reviewed every proposed
            detail and authorize creation of this private draft.
          </label>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="rounded bg-primary px-4 py-3 text-white"
          >
            Approve private draft
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            className="rounded border px-4 py-3"
          >
            Reject proposal
          </button>
        </form>
      )}
      {proposal.result_draft_id && (
        <Link
          href={`/workspace/${clubId}/calendar/drafts/${proposal.result_draft_id}`}
        >
          Open approved private calendar draft
        </Link>
      )}
    </main>
  );
}
