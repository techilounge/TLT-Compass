import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireClub } from "@/lib/auth/session";
import {
  uuid,
  departments,
  departmentLabels,
} from "@/modules/program-rules/contracts";
import {
  Field,
  FormPanel,
  Hidden,
  SaveButton,
} from "@/components/workspace/forms";
import { LocalDate } from "@/components/local-date";
import { saveRecognition } from "./actions";

export default async function RecognitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    participant?: string;
    period?: string;
    level?: string;
    season?: string;
    notice?: string;
  }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, roles, user } = await requireClub(clubId);
  const query = await searchParams;
  const director = roles.includes("director"),
    manager = director || roles.includes("coordinator"),
    staff = roles.some((r) => r !== "participant");
  const [people, rules, settings, badges, seasons] = await Promise.all([
    db
      .from("tlt_participants")
      .select("id,public_alias,profile_id")
      .eq("club_id", clubId)
      .order("public_alias")
      .limit(100),
    db
      .from("point_rules")
      .select("*")
      .eq("club_id", clubId)
      .order("name")
      .limit(100),
    db
      .from("recognition_settings")
      .select("*")
      .eq("club_id", clubId)
      .maybeSingle(),
    db
      .from("badge_definitions")
      .select("*")
      .eq("club_id", clubId)
      .order("name")
      .limit(100),
    db
      .from("seasons")
      .select("id,name")
      .eq("club_id", clubId)
      .order("starts_on", { ascending: false })
      .limit(100),
  ]);
  if ([people, rules, settings, badges, seasons].some((r) => r.error))
    throw new Error("Unable to load recognition.");
  const selected = query.participant
    ? people.data!.find((p) => p.id === query.participant)
    : people.data![0];
  if (query.participant && !selected) notFound();
  const period = ["month", "year", "season", "all"].includes(query.period ?? "")
    ? query.period!
    : "month";
  const season = uuid.safeParse(query.season).success
    ? query.season
    : seasons.data![0]?.id;
  const level = ["1", "2", "3", "4"].includes(query.level ?? "")
    ? Number(query.level)
    : null;
  const [ledger, balance, consent, awards, ranking] = await Promise.all([
    selected
      ? db
          .from("points_ledger")
          .select("*")
          .eq("club_id", clubId)
          .eq("participant_id", selected.id)
          .order("created_at", { ascending: false })
          .limit(500)
      : null,
    selected
      ? db.rpc("points_balance", { target_participant: selected.id })
      : null,
    selected
      ? db
          .from("leaderboard_consents")
          .select("opted_in")
          .eq("club_id", clubId)
          .eq("participant_id", selected.id)
          .maybeSingle()
      : null,
    selected
      ? db
          .from("badge_awards")
          .select("*")
          .eq("club_id", clubId)
          .eq("participant_id", selected.id)
          .order("awarded_at", { ascending: false })
          .limit(100)
      : null,
    period === "season" && !season
      ? null
      : db.rpc("private_leaderboard", {
          target_club: clubId,
          period,
          selected_level: level,
          target_season: season ?? null,
        }),
  ]);
  if ([ledger, balance, consent, awards, ranking].some((r) => r?.error))
    throw new Error("Unable to load recognition records.");
  const action = saveRecognition.bind(null, clubId);
  const operation = (value: string) => (
    <Hidden name="operation" value={value} />
  );
  const explain = (
    <Field label="Reason / reviewed source">
      <textarea name="reason" required maxLength={1000} />
    </Field>
  );
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-6xl space-y-8 px-5 py-10"
    >
      <nav className="flex flex-wrap gap-5" aria-label="Recognition navigation">
        <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
        <Link href={`/workspace/${clubId}/admin`}>Administration</Link>
      </nav>
      <header>
        <p className="eyebrow">{club.name}</p>
        <h1 className="mt-3 text-3xl font-bold">
          Recognition & private leaderboard
        </h1>
        <p className="mt-3 text-muted-foreground">
          Celebrate service, teamwork and growth. Points and badges never sign
          requirements or promote a level.
        </p>
      </header>
      {query.notice && (
        <p role="status" className="notice">
          {query.notice === "saved"
            ? "Recognition saved."
            : "Unable to save. Check approval, consent, source records, award caps and permissions."}
        </p>
      )}
      <form method="get" className="panel flex flex-wrap items-end gap-5">
        <Field label="Participant">
          <select name="participant" defaultValue={selected?.id}>
            {people.data!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.public_alias}
              </option>
            ))}
          </select>
        </Field>
        <SaveButton>Open record</SaveButton>
      </form>
      {selected && (
        <section className="panel space-y-5">
          <h2 className="text-2xl font-bold">{selected.public_alias}</h2>
          <p className="text-3xl font-bold">
            {String(balance?.data ?? 0)}{" "}
            <span className="text-base font-normal">recognition points</span>
          </p>
          <p className="text-sm">
            Private ranking consent:{" "}
            {consent?.data?.opted_in ? "opted in" : "not opted in"}. Rankings
            also require the club switch and confirmed enrollment consent.
          </p>
          {(director || selected.profile_id === user.id) && (
            <form action={action} className="space-y-4">
              {operation("consent")}
              <Hidden name="participant_id" value={selected.id} />
              {director && (
                <>
                  <Field label="Include alias and score in private club rankings">
                    <input
                      name="allow"
                      type="checkbox"
                      defaultChecked={consent?.data?.opted_in}
                    />
                  </Field>
                  <Field label="Required guardian/participant permission has been reviewed">
                    <input name="confirmed" type="checkbox" />
                  </Field>
                </>
              )}
              <SaveButton>
                {director ? "Save ranking consent" : "Opt out of rankings"}
              </SaveButton>
            </form>
          )}
          {staff && selected.profile_id !== user.id && (
            <FormPanel title="Award recognition points">
              <form action={action} className="grid gap-4 sm:grid-cols-2">
                {operation("award")}
                <Hidden name="participant_id" value={selected.id} />
                <Hidden name="request_id" value={randomUUID()} />
                <Field label="Approved local rule">
                  <select name="rule_id" required>
                    {rules
                      .data!.filter((r) => r.status === "approved")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {r.version} · +{r.points}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Source type">
                  <select name="source_kind">
                    <option value="task_review">Verified task review</option>
                    <option value="attendance">
                      Verified attendance entry
                    </option>
                    <option value="training_hours">
                      Verified training hours
                    </option>
                    {manager && (
                      <option value="manual">Manager-reviewed activity</option>
                    )}
                  </select>
                </Field>
                <Field label="Source reference ID">
                  <input
                    name="source_id"
                    required
                    placeholder="Activity or reviewed record UUID"
                  />
                </Field>
                {explain}
                <SaveButton>Award points</SaveButton>
              </form>
            </FormPanel>
          )}
          {staff && selected.profile_id !== user.id && (
            <FormPanel title="Award a noncompetitive badge">
              <form action={action} className="space-y-4">
                {operation("award_badge")}
                <Hidden name="participant_id" value={selected.id} />
                <Field label="Approved badge">
                  <select name="badge_id" required>
                    {badges.data!.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {explain}
                <SaveButton>Award badge</SaveButton>
              </form>
            </FormPanel>
          )}
          <h3 className="font-bold">Badges</h3>
          {!awards?.data?.length && <p>No badges awarded yet.</p>}
          {awards?.data?.map((a) => (
            <div key={a.id} className="border-t border-border pt-4">
              <p className="font-semibold">
                {badges.data!.find((b) => b.id === a.badge_id)?.name ?? "Badge"}{" "}
                · {a.revoked_at ? "revoked" : "awarded"}
              </p>
              <p>{a.reason}</p>
              <p className="text-sm">
                <LocalDate value={a.awarded_at} />
              </p>
              {director && !a.revoked_at && (
                <form action={action} className="mt-3 space-y-3">
                  {operation("revoke_badge")}
                  <Hidden name="award_id" value={a.id} />
                  {explain}
                  <SaveButton>Revoke with explanation</SaveButton>
                </form>
              )}
            </div>
          ))}
          <h3 className="font-bold">Ledger history</h3>
          <p className="text-sm text-muted-foreground">
            Latest 500 entries shown; balance includes the full ledger.
          </p>
          {ledger?.data?.map((l) => (
            <article key={l.id} className="border-t border-border pt-4">
              <p>
                <strong>
                  {l.points_delta > 0 ? "+" : ""}
                  {l.points_delta}
                </strong>{" "}
                ·{" "}
                {rules.data!.find((r) => r.id === l.rule_id)?.name ??
                  "Historical rule"}{" "}
                · {l.source_kind}
              </p>
              <p className="mt-1">{l.reason}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {l.awarded_on} · Source {l.source_id} · Actor {l.actor_id}
              </p>
              {director &&
                l.points_delta > 0 &&
                !ledger.data.some((r) => r.reversal_of === l.id) && (
                  <FormPanel title="Reverse this award">
                    <form action={action} className="space-y-3">
                      {operation("reverse")}
                      <Hidden name="award_id" value={l.id} />
                      <Hidden name="request_id" value={randomUUID()} />
                      {explain}
                      <SaveButton>Append reversal</SaveButton>
                    </form>
                  </FormPanel>
                )}
            </article>
          ))}
        </section>
      )}
      <section className="panel">
        <h2 className="text-2xl font-bold">Private club leaderboard</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Off by default. Only consent-reviewed aliases appear; no public
          display. Up to 100 entries.
        </p>
        <form method="get" className="mt-5 flex flex-wrap items-end gap-4">
          {selected && <Hidden name="participant" value={selected.id} />}
          <Field label="Period">
            <select name="period" defaultValue={period}>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="season">Season</option>
              <option value="all">All time</option>
            </select>
          </Field>
          <Field label="Level">
            <select name="level" defaultValue={level ?? ""}>
              <option value="">All levels</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Season">
            <select name="season" defaultValue={season}>
              {seasons.data!.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <SaveButton>Filter rankings</SaveButton>
        </form>
        {!ranking?.data?.length ? (
          <p className="mt-5 notice">
            No opted-in rankings to show for this period.
          </p>
        ) : (
          <ol className="mt-5 space-y-3">
            {ranking.data.map(
              (
                r: { alias: string; level: number; points: number },
                i: number,
              ) => (
                <li
                  key={`${r.alias}-${i}`}
                  className="flex justify-between gap-4 border-t border-border py-3"
                >
                  <span>
                    {i + 1}. {r.alias} · Level {r.level}
                  </span>
                  <strong>{r.points}</strong>
                </li>
              ),
            )}
          </ol>
        )}
      </section>
      <section className="panel space-y-5">
        <h2 className="text-2xl font-bold">Local recognition rules</h2>
        <p className="text-sm">
          These are club gamification rules, not official curriculum. Create a
          new version to change amounts. Quiz share is capped at award time;
          reversals remain allowed to correct history.
        </p>
        {rules.data!.map((r) => (
          <div className="border-t border-border pt-4" key={r.id}>
            <p className="font-semibold">
              {r.name} · {r.version} · {r.status}
            </p>
            <p>
              +{r.points} · activity cap {r.activity_cap} · monthly cap{" "}
              {r.monthly_cap} · {r.category}
            </p>
            {director && r.status !== "retired" && (
              <form action={action} className="mt-2">
                {operation("rule_status")}
                <Hidden name="rule_id" value={r.id} />
                <Hidden
                  name="status"
                  value={r.status === "draft" ? "approved" : "retired"}
                />
                <SaveButton>
                  {r.status === "draft" ? "Approve rule" : "Retire rule"}
                </SaveButton>
              </form>
            )}
          </div>
        ))}
        {manager && (
          <FormPanel title="Create a draft rule version">
            <form action={action} className="grid gap-4 sm:grid-cols-2">
              {operation("create_rule")}
              <Field label="Rule name">
                <input name="name" required maxLength={120} />
              </Field>
              <Field label="Version">
                <input name="version" required maxLength={80} />
              </Field>
              <Field label="Category">
                <select name="category">
                  {[
                    "attendance",
                    "task",
                    "leadership",
                    "collaboration",
                    "reflection",
                    "service",
                    "quiz",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Department">
                <select name="department">
                  <option value="">Any / primary mentor</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {departmentLabels[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Points">
                <input
                  name="points"
                  type="number"
                  min={1}
                  max={1000}
                  required
                />
              </Field>
              <Field label="Per-activity category cap">
                <input
                  name="activity_cap"
                  type="number"
                  min={1}
                  max={1000}
                  required
                />
              </Field>
              <Field label="Monthly rule cap">
                <input
                  name="monthly_cap"
                  type="number"
                  min={1}
                  max={10000}
                  required
                />
              </Field>
              <SaveButton>Create draft</SaveButton>
            </form>
          </FormPanel>
        )}
        {director && (
          <>
            <FormPanel title="Ranking and quiz policy">
              <form action={action} className="space-y-4">
                {operation("settings")}
                <Field label="Maximum quiz contribution (%)">
                  <input
                    name="quiz_percent"
                    type="number"
                    min={0}
                    max={50}
                    defaultValue={
                      settings.data?.quiz_contribution_percent ?? 25
                    }
                    required
                  />
                </Field>
                <Field label="Enable private club rankings">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={settings.data?.leaderboard_enabled ?? false}
                  />
                </Field>
                <SaveButton>Save policy</SaveButton>
              </form>
            </FormPanel>
            <FormPanel title="Approve a noncompetitive badge">
              <form action={action} className="space-y-4">
                {operation("create_badge")}
                <Field label="Badge name">
                  <input name="name" required maxLength={100} />
                </Field>
                <Field label="Reviewed criteria">
                  <textarea name="criteria" required maxLength={2000} />
                </Field>
                <SaveButton>Approve badge</SaveButton>
              </form>
            </FormPanel>
          </>
        )}
      </section>
    </main>
  );
}
