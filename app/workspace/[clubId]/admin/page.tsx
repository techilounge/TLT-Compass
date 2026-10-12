import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid, type RuleRecord } from "@/modules/program-rules/contracts";
import { ClubSetup } from "@/components/workspace/setup";
import { Field, SaveButton } from "@/components/workspace/forms";
import { updateMemberRole } from "./actions";

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, user, club, roles } = await requireClub(clubId);
  const isDirector = roles.includes("director");
  if (!isDirector && !roles.includes("coordinator"))
    redirect(`/workspace/${clubId}?notice=permission`);
  const { notice } = await searchParams;
  const [rules, seasons, members, profiles, eligibility] = await Promise.all([
    db
      .from("program_rule_sets")
      .select("*")
      .eq("club_id", clubId)
      .order("version")
      .limit(100),
    db
      .from("seasons")
      .select("id,name,starts_on,ends_on")
      .eq("club_id", clubId)
      .order("starts_on", { ascending: false })
      .limit(100),
    db
      .from("club_memberships")
      .select("profile_id,role,status")
      .eq("club_id", clubId)
      .order("created_at")
      .limit(500),
    db.from("profiles").select("id,display_name").limit(500),
    db
      .from("staff_eligibility")
      .select("profile_id,eligible")
      .eq("club_id", clubId)
      .limit(500),
  ]);
  if ([rules, seasons, members, profiles, eligibility].some((r) => r.error))
    throw new Error("Unable to load administration settings.");
  const names = new Map(profiles.data!.map((p) => [p.id, p.display_name]));
  const eligible = new Set(
    eligibility.data!.filter((e) => e.eligible).map((e) => e.profile_id),
  );
  const memberIds = [...new Set(members.data!.map((m) => m.profile_id))];
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-6">
        <Link href={`/workspace/${clubId}`} className="font-bold">
          ✦ TLT Compass · {club.name}
        </Link>
        <Link
          href="/account/security"
          className="min-h-11 py-3 text-sm text-primary"
        >
          Account security
        </Link>
      </header>
      <div className="workspace-layout">
        <aside>
          <nav aria-label="Administration navigation" className="club-nav">
            <Link href={`/workspace/${clubId}`}>Club workspace</Link>
            <Link href={`/workspace/${clubId}/calendar`}>
              Calendar & imports
            </Link>
            <Link href={`/workspace/${clubId}/dashboard`}>
              Progress & mentor analytics
            </Link>
            <Link href={`/workspace/${clubId}/recognition`}>
              Recognition & rules
            </Link>
            <a href="#main" aria-current="page">
              Admin Dashboard
            </a>
            <a href="#setup">Club & curriculum settings</a>
            <a href="#seasons">Seasons</a>
            <Link href={`/workspace/${clubId}/hours`}>
              Workshop & lab hours
            </Link>
            <a href="#members">Members & roles</a>
            <Link href={`/workspace/${clubId}/attendance`}>
              Attendance & uniform
            </Link>
            <Link href={`/workspace/${clubId}#roster`}>
              Participant onboarding
            </Link>
          </nav>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 space-y-10 pb-16">
          <section>
            <p className="eyebrow">
              {isDirector ? "Director" : "Coordinator"} administration
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              Admin Dashboard
            </h1>
            <p className="mt-4 text-muted-foreground">
              Manage {club.name}’s program, seasons, and club access.
            </p>
            {notice && (
              <p role="status" className="notice mt-5">
                {notice === "saved"
                  ? "Changes saved."
                  : "Unable to change this role. Check eligibility and permissions; your own roles cannot be changed here."}
              </p>
            )}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ["Rule versions", rules.data!.length],
                ["Seasons", seasons.data!.length],
                ["Club members", memberIds.length],
              ].map(([label, count]) => (
                <div className="panel" key={label}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className="mt-3 text-3xl font-bold">{count}</p>
                </div>
              ))}
            </div>
            {rules.data!.length === 0 && (
              <p className="notice mt-6">
                Start by creating a draft rule version below. Add source-cited
                requirements, review and approve the version, then create a
                season and onboard participants.
              </p>
            )}
          </section>
          <ClubSetup
            clubId={clubId}
            clubName={club.name}
            timezone={club.timezone}
            rules={rules.data as RuleRecord[]}
            isDirector={isDirector}
            returnArea="admin"
          />
          <section id="seasons" className="scroll-mt-6 space-y-4">
            <h2 className="text-2xl font-bold">Seasons</h2>
            {seasons.data!.length === 0 ? (
              <p className="notice">
                No seasons yet. Create a rule version to unlock season setup
                above.
              </p>
            ) : (
              seasons.data!.map((season) => (
                <article className="panel" key={season.id}>
                  <h3 className="font-semibold">{season.name}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {season.starts_on} to {season.ends_on}
                  </p>
                </article>
              ))
            )}
          </section>
          <section id="members" className="scroll-mt-6 space-y-4">
            <h2 className="text-2xl font-bold">Members & roles</h2>
            <p className="text-muted-foreground">
              Invitations and adult eligibility reviews are currently managed
              through trusted operator tooling. Adult roles require reviewed
              eligibility and MFA. Existing club members are listed below.
            </p>
            {memberIds.map((id) => (
              <article className="panel" key={id}>
                <h3 className="font-semibold">
                  {names.get(id) ?? "Club member"}
                  {id === user.id ? " (you)" : ""}
                </h3>
                <ul className="mt-3 space-y-2">
                  {members
                    .data!.filter((m) => m.profile_id === id)
                    .map((m) => (
                      <li key={m.role}>
                        {m.role.replaceAll("_", " ")} · {m.status}
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                  {eligible.has(id)
                    ? "Adult eligibility confirmed"
                    : "No confirmed adult eligibility"}
                </p>
              </article>
            ))}
            {isDirector && memberIds.some((id) => id !== user.id) && (
              <form
                action={updateMemberRole.bind(null, clubId)}
                className="panel space-y-4"
              >
                <h3 className="font-semibold">Change a member role</h3>
                <Field label="Member">
                  <select name="profile_id" required>
                    {memberIds
                      .filter((id) => id !== user.id)
                      .map((id) => (
                        <option value={id} key={id}>
                          {names.get(id) ?? "Club member"} · {id}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Role">
                  <select name="role">
                    <option value="coordinator">Coordinator</option>
                    <option value="primary_mentor">Primary mentor</option>
                    <option value="operational_mentor">
                      Operational mentor
                    </option>
                    <option value="participant">Participant</option>
                    <option value="director">Director</option>
                  </select>
                </Field>
                <Field label="Access">
                  <select name="active">
                    <option value="true">Activate this role</option>
                    <option value="false">Revoke this role</option>
                  </select>
                </Field>
                <SaveButton>Save member role</SaveButton>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
