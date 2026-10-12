import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { Field, SaveButton } from "@/components/workspace/forms";
import { reviewTaskProposal } from "../actions";
export default async function TaskProposal({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; proposalId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId, proposalId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(proposalId).success)
    notFound();
  const { db, roles, user, club } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/ai`);
  const result = await db
    .from("ai_task_proposals")
    .select("*")
    .eq("club_id", clubId)
    .eq("id", proposalId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load proposal");
  if (!result.data) notFound();
  const p = result.data;
  const person = await db
    .from("tlt_participants")
    .select("public_alias")
    .eq("club_id", clubId)
    .eq("id", p.participant_id)
    .single();
  const req = await db
    .from("program_requirements")
    .select("description,source_page,source_section")
    .eq("club_id", clubId)
    .eq("id", p.requirement_id)
    .single();
  if (person.error || req.error)
    throw new Error("Unable to load proposal scope");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/ai/task-proposals`}>
        ← Task proposals
      </Link>
      <h1>Review exact task suggestion</h1>
      <p>
        {club.name} · {person.data.public_alias} · Reviewer{" "}
        {user.email ?? "current account"} · {p.status}
      </p>
      {(await searchParams).notice && (
        <p role="alert">
          Review could not complete. Refresh and verify consent, requirement
          scope and the exact proposed changes.
        </p>
      )}
      <section className="panel space-y-3">
        <h2>Approved requirement</h2>
        <p>{req.data.description}</p>
        <p>
          {req.data.source_section} · page {req.data.source_page}
        </p>
        <h2>{p.payload.title}</h2>
        <p className="whitespace-pre-wrap">{p.payload.instructions}</p>
        <p>Due date: {p.payload.due_on ?? "Not set"}</p>
      </section>
      <p>
        Check safety, supervision, policy accuracy and feasibility. Approval
        creates a staff-only task draft. Assignment is a separate human action;
        no points or official completion are granted.
      </p>
      {p.status === "pending" && (
        <form
          action={reviewTaskProposal.bind(null, clubId, proposalId)}
          className="panel space-y-4"
        >
          <input
            type="hidden"
            name="exact_payload"
            value={JSON.stringify(p.payload)}
          />
          <Field label="Human review">
            <span>
              <input type="checkbox" name="confirmed" required /> I reviewed
              these exact instructions and authorize a private task draft.
            </span>
          </Field>
          <SaveButton>
            <span>Approve task draft</span>
          </SaveButton>
          <input type="hidden" name="decision" value="approve" />
        </form>
      )}
      {p.status === "pending" && (
        <form action={reviewTaskProposal.bind(null, clubId, proposalId)}>
          <input
            type="hidden"
            name="exact_payload"
            value={JSON.stringify(p.payload)}
          />
          <input type="hidden" name="decision" value="reject" />
          <SaveButton>Reject suggestion</SaveButton>
        </form>
      )}
      {p.result_task_id && (
        <Link href={`/workspace/${clubId}#tasks`}>
          Review and assign the new task draft in Tasks &amp; reviews
        </Link>
      )}
    </main>
  );
}
