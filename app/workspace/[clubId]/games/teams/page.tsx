import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { SaveButton } from "@/components/workspace/forms";
import { manageTeam } from "./actions";
export default async function Teams({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    session_id?: string;
    page?: string;
    notice?: string;
    search?: string;
  }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/games`);
  const query = await searchParams,
    page = /^\d{1,4}$/.test(query.page ?? "")
      ? Math.max(1, Number(query.page))
      : 1;
  const sessions = await db
    .from("game_sessions")
    .select("id,title")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (sessions.error) throw Error("Unable to load sessions");
  const selected = query.session_id ?? sessions.data[0]?.id;
  const session =
    selected && uuid.safeParse(selected).success
      ? await db
          .from("game_sessions")
          .select("id,title,season_id,status,instructions")
          .eq("club_id", clubId)
          .eq("id", selected)
          .maybeSingle()
      : null;
  if (session?.error) throw Error("Unable to load session");
  const current = session?.data;
  const teams = current
    ? await db
        .from("game_teams")
        .select("id,name,maximum_members")
        .eq("club_id", clubId)
        .eq("session_id", current.id)
        .order("created_at")
        .order("id")
        .range((page - 1) * 25, page * 25)
    : null;
  if (teams?.error) throw Error("Unable to load teams");
  const shown = teams?.data?.slice(0, 25) ?? [],
    ids = shown.map((t) => t.id);
  const members = ids.length
    ? await db
        .from("game_team_members")
        .select("id,team_id,participant_id")
        .eq("club_id", clubId)
        .eq("session_id", current!.id)
        .in("team_id", ids)
        .is("ended_at", null)
    : null;
  const roster = current
    ? await db
        .from("tlt_participants")
        .select("id,public_alias,status,consent_state")
        .eq("club_id", clubId)
        .eq("season_id", current.season_id)
        .eq("status", "active")
        .eq("consent_state", "confirmed")
        .ilike(
          "public_alias",
          `%${(query.search ?? "").slice(0, 80).replace(/[\\%_]/g, "\\$&")}%`,
        )
        .order("public_alias")
        .limit(100)
    : null;
  if (members?.error || roster?.error)
    throw Error("Unable to load team roster");
  const memberIds = [
    ...new Set((members?.data ?? []).map((m) => m.participant_id)),
  ];
  const aliasBatches = await Promise.all(
    Array.from({ length: Math.ceil(memberIds.length / 100) }, (_, index) =>
      db
        .from("tlt_participants")
        .select("id,public_alias")
        .eq("club_id", clubId)
        .in("id", memberIds.slice(index * 100, (index + 1) * 100)),
    ),
  );
  if (aliasBatches.some((result) => result.error))
    throw Error("Unable to load member aliases");
  const aliases = aliasBatches.flatMap((result) => result.data ?? []);
  const action = current ? manageTeam.bind(null, clubId, current.id) : null;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/games`}>← Games</Link>
      <h1>Supervised team challenges</h1>
      <p>
        Organize cooperative activity groups for an existing supervised session.
        Team membership never awards points or official completion. Avoid
        personal details in team names and instructions.
      </p>
      <form>
        <label>
          Recent session
          <select name="session_id" defaultValue={selected ?? ""}>
            <option value="">Choose a session</option>
            {current && !sessions.data.some((s) => s.id === current.id) && (
              <option value={current.id}>{current.title}</option>
            )}
            {sessions.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find participant alias
          <input
            name="search"
            maxLength={80}
            defaultValue={query.search ?? ""}
          />
        </label>
        <SaveButton>Open session</SaveButton>
      </form>
      {query.notice && (
        <p role="status" className="notice">
          {query.notice === "saved"
            ? "Team change saved."
            : "Unable to change the team. Check consent, season, capacity and session status."}
        </p>
      )}
      {!current && (
        <p>
          Create a supervised session under{" "}
          <Link href={`/workspace/${clubId}/games/results`}>
            sessions and results
          </Link>
          .
        </p>
      )}
      {current && action && (
        <>
          <h2>
            {current.title} · {current.status}
          </h2>
          <p>{current.instructions}</p>
          {current.status === "open" && (
            <form action={action} className="panel grid gap-4">
              <input type="hidden" name="operation" value="create" />
              <label>
                Team name
                <input name="name" required maxLength={80} />
              </label>
              <label>
                Maximum members
                <input
                  name="maximum_members"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue="6"
                  required
                />
              </label>
              <SaveButton>Create team</SaveButton>
            </form>
          )}
          {shown.map((team) => (
            <section key={team.id} className="panel space-y-4">
              <h3>
                {team.name} · maximum {team.maximum_members}
              </h3>
              <ul>
                {(members?.data ?? [])
                  .filter((m) => m.team_id === team.id)
                  .map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-4"
                    >
                      <span>
                        {aliases.find((p) => p.id === m.participant_id)
                          ?.public_alias ?? "Participant record"}
                      </span>
                      {current.status === "open" && (
                        <form action={action}>
                          <input type="hidden" name="operation" value="end" />
                          <input
                            type="hidden"
                            name="participant_id"
                            value={m.participant_id}
                          />
                          <SaveButton>Remove from team</SaveButton>
                        </form>
                      )}
                    </li>
                  ))}
              </ul>
              {current.status === "open" && (
                <form action={action} className="grid gap-3">
                  <input type="hidden" name="operation" value="assign" />
                  <input type="hidden" name="team_id" value={team.id} />
                  <label>
                    Assign or move participant
                    <select name="participant_id" required>
                      <option value="">Choose active participant</option>
                      {(roster?.data ?? [])
                        .filter(
                          (p) =>
                            p.status === "active" &&
                            p.consent_state === "confirmed",
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.public_alias}
                          </option>
                        ))}
                    </select>
                  </label>
                  <SaveButton>Assign participant</SaveButton>
                </form>
              )}
            </section>
          ))}
          <p>
            Participant choices show up to 100 matching active, consented season
            records. Use the alias search to narrow the list. Team membership
            history is retained when moving or removing a participant.
          </p>
          <nav aria-label="Team pages" className="flex gap-4">
            {page > 1 && (
              <Link href={`?session_id=${current.id}&page=${page - 1}`}>
                Previous
              </Link>
            )}
            <span>Page {page}</span>
            {(teams?.data?.length ?? 0) > 25 && (
              <Link href={`?session_id=${current.id}&page=${page + 1}`}>
                Next
              </Link>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
