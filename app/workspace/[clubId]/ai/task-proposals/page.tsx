import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { LocalDate } from "@/components/local-date";
import { Field, SaveButton } from "@/components/workspace/forms";
import { proposeTask } from "./actions";
export default async function TaskProposals({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    participant_id?: string;
    requirement_id?: string;
    notice?: string;
  }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/ai`);
  const query = await searchParams;
  const participant = uuid.safeParse(query.participant_id),
    requirement = uuid.safeParse(query.requirement_id);
  const person = participant.success
    ? await db
        .from("tlt_participants")
        .select("id,public_alias")
        .eq("club_id", clubId)
        .eq("id", participant.data)
        .maybeSingle()
    : null;
  const req = requirement.success
    ? await db
        .from("program_requirements")
        .select("id,description,source_page,source_section")
        .eq("club_id", clubId)
        .eq("id", requirement.data)
        .maybeSingle()
    : null;
  const proposals = await db
    .from("ai_task_proposals")
    .select("id,status,created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (proposals.error || person?.error || req?.error)
    throw new Error("Unable to load task proposals");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/ai`}>← AI Integration</Link>
      <h1>Human-reviewed task proposals</h1>
      <p>
        Start from a requirement in a participant’s Record Book. Only approved
        requirement text, source citations and level are sent to the provider.
        Participant identity and the chosen due date stay in this app.
      </p>
      {query.notice && (
        <p role="alert">
          Proposal unavailable. Check active consent, the approved current-level
          requirement, provider configuration and budget.
        </p>
      )}
      {person?.data && req?.data ? (
        <form
          action={proposeTask.bind(null, clubId)}
          className="panel space-y-4"
        >
          <h2>{person.data.public_alias}</h2>
          <p>{req.data.description}</p>
          <p>
            {req.data.source_section} · page {req.data.source_page}
          </p>
          <input type="hidden" name="participant_id" value={person.data.id} />
          <input type="hidden" name="requirement_id" value={req.data.id} />
          <Field label="Optional due date (set by you)">
            <input type="date" name="due_on" />
          </Field>
          <label>
            <input type="checkbox" name="confirmed" required /> Send the
            displayed requirement and its level/source citations to the
            configured privacy-approved AI provider.
          </label>
          <SaveButton>Prepare task suggestion</SaveButton>
        </form>
      ) : (
        <p className="notice">
          Open a participant’s Record Book and choose “Suggest a supervised
          task” beside a requirement.
        </p>
      )}
      <h2>Recent proposals</h2>
      <p>Showing up to 100 recent proposals.</p>
      <ul>
        {proposals.data.map((p) => (
          <li key={p.id}>
            <Link href={`/workspace/${clubId}/ai/task-proposals/${p.id}`}>
              <LocalDate value={p.created_at} /> · {p.status}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
