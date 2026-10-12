import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { Field, Hidden, SaveButton } from "@/components/workspace/forms";
import { providerTypes, purposes } from "@/modules/ai/contracts";
import { configureAI } from "./actions";
import { AIUsage } from "@/components/workspace/ai-usage";
import { LocalDate } from "@/components/local-date";
export default async function ProvidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string; view?: string; days?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, roles, club } = await requireClub(clubId);
  if (
    !roles.some((r) =>
      [
        "director",
        "coordinator",
        "primary_mentor",
        "operational_mentor",
      ].includes(r),
    )
  )
    redirect(`/workspace/${clubId}?notice=permission`);
  const [permission, settings, providers, models, attempts] = await Promise.all(
    [
      db.rpc("can_configure_ai", { target_club: clubId }),
      db.from("ai_settings").select("*").eq("club_id", clubId).maybeSingle(),
      db
        .from("ai_providers")
        .select("*")
        .eq("club_id", clubId)
        .order("priority")
        .order("id")
        .limit(100),
      db
        .from("ai_models")
        .select("*")
        .eq("club_id", clubId)
        .order("priority")
        .order("id")
        .limit(500),
      db
        .from("ai_attempts")
        .select(
          "id,created_at,status,error_code,latency_ms,reserved_usd,estimated_cost_usd,purpose,trace_id",
        )
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(100),
    ],
  );
  if ([permission, settings, providers, models, attempts].some((r) => r.error))
    throw new Error("Unable to load AI registry");
  const owner = permission.data === true,
    action = configureAI.bind(null, clubId),
    notice = (await searchParams).notice;
  const globalSettings = owner
    ? await db
        .from("ai_global_settings")
        .select("*")
        .eq("singleton", true)
        .single()
    : null;
  if (globalSettings?.error) throw Error("Unable to load global AI controls");
  const [clubUsage, globalUsage] = await Promise.all([
    db.rpc("club_ai_usage", { target_club: clubId }),
    owner ? db.rpc("global_ai_usage") : Promise.resolve(null),
  ]);
  if (clubUsage.error || globalUsage?.error)
    throw Error("Unable to load AI usage");
  const query = await searchParams;
  const usageView = query.view === "usage";
  const days = [7, 14, 30].includes(Number(query.days))
    ? Number(query.days)
    : 14;
  const breakdown = usageView
    ? await db.rpc("club_ai_usage_breakdown", {
        target_club: clubId,
        window_days: days,
      })
    : null;
  if (breakdown?.error) throw Error("Unable to load provider usage");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/ai`}>← AI Integration</Link>
      <p className="eyebrow">{club.name}</p>
      <h1>Platform APIs</h1>
      <p>
        Choose which providers serve AI requests and their fallback order. Saved
        changes apply to the next request without redeploying.
      </p>
      <nav
        aria-label="AI administration"
        className="flex flex-wrap gap-4 border-b pb-4"
      >
        <Link
          href="?view=providers"
          aria-current={!usageView ? "page" : undefined}
        >
          Providers
        </Link>
        <Link href="?view=usage" aria-current={usageView ? "page" : undefined}>
          Usage &amp; cost
        </Link>
        <Link href={usageView ? "?view=usage" : "?view=providers"}>
          Refresh
        </Link>
        {owner && !usageView && <a href="#add-provider">+ Add provider</a>}
      </nav>
      {notice && (
        <p role="status" className="notice">
          {notice === "saved"
            ? "Configuration saved."
            : notice === "tested"
              ? "Synthetic inference passed. No personal data was sent."
              : "The operation could not complete. Review configuration, health and budgets."}
        </p>
      )}
      {!owner && (
        <p className="notice">
          Configuration requires a separately provisioned Platform Owner with an
          eligible club manager role and MFA. Club director access does not
          automatically grant platform ownership.
        </p>
      )}
      {usageView && (
        <>
          <AIUsage
            usage={clubUsage.data}
            budget={
              roles.some((r) => ["director", "coordinator"].includes(r))
                ? Number(settings.data?.monthly_budget_usd ?? 0)
                : undefined
            }
            alertPercent={settings.data?.usage_alert_percent ?? 80}
          />
          {owner && globalUsage?.data && (
            <AIUsage
              usage={globalUsage.data}
              budget={Number(globalSettings?.data?.monthly_budget_usd ?? 0)}
              alertPercent={settings.data?.usage_alert_percent ?? 80}
            />
          )}
        </>
      )}
      {!usageView && (
        <>
          <p className="notice">
            OpenRouter is the initial provider choice. Add its configuration
            below, store the key securely, and choose model IDs and fallback
            priorities. AI remains off until you enable both switches and set
            spending limits.
          </p>
          {owner && (
            <details className="panel">
              <summary>Global AI limits across every club</summary>
              <p>
                Both global and club switches must be enabled. Failed and
                interrupted reservations count toward the UTC monthly ceiling.
                These settings affect every tenant.
              </p>
              <form action={action} className="mt-5 grid gap-4 md:grid-cols-2">
                <Hidden name="operation" value="global" />
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={globalSettings?.data?.enabled ?? false}
                  />{" "}
                  Enable AI platform-wide
                </label>
                <label>
                  Monthly ceiling (USD)
                  <input
                    name="monthly_budget"
                    type="number"
                    min="0"
                    max="100000"
                    step="0.000001"
                    required
                    defaultValue={globalSettings?.data?.monthly_budget_usd ?? 0}
                  />
                </label>
                <label>
                  Attempts per minute, all clubs
                  <input
                    name="minute_limit"
                    type="number"
                    min="1"
                    max="10000"
                    required
                    defaultValue={
                      globalSettings?.data?.attempts_per_minute ?? 60
                    }
                  />
                </label>
                <label>
                  Attempts per person per minute, all clubs
                  <input
                    name="actor_minute_limit"
                    type="number"
                    min="1"
                    max="100"
                    required
                    defaultValue={
                      globalSettings?.data?.actor_attempts_per_minute ?? 10
                    }
                  />
                </label>
                <SaveButton>Save global AI limits</SaveButton>
              </form>
            </details>
          )}
          {owner && (
            <details className="panel">
              <summary>AI switch and spending controls</summary>
              <form action={action} className="mt-5 grid gap-4 md:grid-cols-2">
                <Hidden name="operation" value="settings" />
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={settings.data?.enabled ?? false}
                  />{" "}
                  Enable AI
                </label>
                {Object.entries({
                  monthly_budget_usd: [
                    0,
                    0,
                    10000,
                    "Monthly club ceiling (USD)",
                  ],
                  role_monthly_budget_usd: [
                    0,
                    0,
                    10000,
                    "Monthly ceiling per role (USD)",
                  ],
                  request_ceiling_usd: [0, 0, 10, "Request ceiling (USD)"],
                  max_output_tokens: [512, 32, 16384, "Maximum output tokens"],
                  timeout_ms: [10000, 1000, 20000, "Attempt timeout (ms)"],
                  max_attempts: [3, 1, 5, "Maximum attempts"],
                  circuit_failures: [3, 1, 10, "Circuit failure threshold"],
                  cooldown_seconds: [
                    300,
                    30,
                    86400,
                    "Circuit cooldown (seconds)",
                  ],
                  analytics_minimum_cohort: [
                    5,
                    1,
                    100,
                    "Minimum cohort for AI analytics",
                  ],
                  usage_alert_percent: [
                    80,
                    1,
                    100,
                    "Usage dashboard warning threshold (%)",
                  ],
                }).map(([key, values]) => (
                  <Field key={key} label={String(values[3])}>
                    <input
                      type="number"
                      name={key}
                      min={Number(values[1])}
                      max={Number(values[2])}
                      step={key.includes("usd") ? "0.000001" : "1"}
                      defaultValue={settings.data?.[key] ?? Number(values[0])}
                      required
                    />
                  </Field>
                ))}
                <p>
                  Budgets charge conservative reservations, including failed or
                  interrupted attempts. Estimated token cost is shown
                  separately.
                </p>
                <SaveButton />
              </form>
            </details>
          )}
          {[...(providers.data ?? []), ...(owner ? [null] : [])].map(
            (p, index) => (
              <section
                id={!p ? "add-provider" : undefined}
                key={p?.id ?? "new"}
                className="panel space-y-4"
              >
                <h2>{p ? `#${index + 1} ${p.name}` : "Add provider"}</h2>
                {p && (
                  <>
                    <p>
                      {p.provider_type} · {p.enabled ? "On" : "Off"} ·{" "}
                      {p.credential_last_four
                        ? "Encrypted key stored"
                        : "Key not configured"}
                    </p>
                    <ol className="space-y-2">
                      {(models.data ?? [])
                        .filter((m) => m.provider_id === p.id)
                        .map((m, i) => (
                          <li key={m.id}>
                            {i === 0 ? "Primary" : "Fallback " + i}:{" "}
                            {m.model_id} ·{" "}
                            {m.enabled
                              ? m.configuration_fault
                                ? "Configuration fault"
                                : m.circuit_until &&
                                    Date.parse(m.circuit_until) > Date.now()
                                  ? "Cooling down"
                                  : (m.last_status ?? "Not tested")
                              : "Off"}
                            {m.last_check_at && (
                              <>
                                {" "}
                                · checked <LocalDate value={m.last_check_at} />
                              </>
                            )}
                          </li>
                        ))}
                    </ol>
                  </>
                )}
                {p && owner && (
                  <div className="flex flex-wrap gap-3">
                    {[-1, 1].map((direction) => (
                      <form key={direction} action={action}>
                        <Hidden name="operation" value="move" />
                        <Hidden name="id" value={p.id} />
                        <Hidden name="direction" value={String(direction)} />
                        <button
                          className="rounded border px-4 py-3"
                          disabled={
                            direction === -1
                              ? index === 0
                              : index === (providers.data?.length ?? 0) - 1
                          }
                        >
                          {direction === -1 ? "↑ Move up" : "↓ Move down"}
                        </button>
                      </form>
                    ))}
                    <form action={action}>
                      <Hidden name="operation" value="toggle" />
                      <Hidden name="id" value={p.id} />
                      <Hidden name="enabled" value={String(!p.enabled)} />
                      <SaveButton>
                        {p.enabled ? "Turn off" : "Turn on"}
                      </SaveButton>
                    </form>
                  </div>
                )}
                {owner ? (
                  <details open={!p}>
                    <summary>
                      {p ? "Edit provider" : "Provider details"}
                    </summary>
                    <form action={action} className="grid gap-4 md:grid-cols-2">
                      <Hidden name="operation" value="provider" />
                      {p && <Hidden name="id" value={p.id} />}
                      <Field label="Name">
                        <input
                          name="name"
                          maxLength={80}
                          defaultValue={p?.name ?? "OpenRouter"}
                          required
                        />
                      </Field>
                      <Field label="Provider type">
                        <select
                          name="provider_type"
                          defaultValue={p?.provider_type ?? "openrouter"}
                        >
                          {providerTypes.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Allowlisted HTTPS API base URL">
                        <input
                          name="base_url"
                          type="url"
                          defaultValue={
                            p?.base_url ?? "https://openrouter.ai/api/v1"
                          }
                          required
                        />
                      </Field>
                      <Field label="Server credential reference">
                        <input
                          name="credential_secret_ref"
                          pattern="AI_SECRET_[A-Z0-9_]+"
                          placeholder="AI_SECRET_PROVIDER_NAME"
                          defaultValue={
                            p?.credential_secret_ref ?? "AI_SECRET_OPENROUTER"
                          }
                          required
                        />
                      </Field>
                      <Field label="Provider priority (lower first)">
                        <input
                          type="number"
                          name="priority"
                          min={0}
                          max={1000}
                          defaultValue={p?.priority ?? 100}
                          required
                        />
                      </Field>
                      <label>
                        <input
                          name="enabled"
                          type="checkbox"
                          defaultChecked={p?.enabled ?? false}
                        />{" "}
                        Enabled
                      </label>
                      <label>
                        <input
                          name="privacy_approved"
                          type="checkbox"
                          defaultChecked={p?.privacy_approved ?? false}
                        />{" "}
                        Provider privacy approved for configured purposes
                      </label>
                      <p>
                        Credentials are configured in server secrets using this
                        reference. Never paste an API key into the reference
                        field. Model IDs and prices are explicitly configured;
                        no provider price is assumed.
                      </p>
                      <SaveButton />
                    </form>
                  </details>
                ) : (
                  <p>
                    Priority {p?.priority} ·{" "}
                    {p?.enabled ? "Enabled" : "Disabled"} · {p?.provider_type}
                  </p>
                )}
                {p && owner && (
                  <details className="panel">
                    <summary>
                      Set or rotate API key ·{" "}
                      {p.credential_last_four
                        ? `••••${p.credential_last_four}`
                        : "No stored key"}
                    </summary>
                    <form action={action} className="mt-4 grid gap-4">
                      <Hidden name="operation" value="key" />
                      <Hidden name="id" value={p.id} />
                      <Field label="New provider API key">
                        <input
                          type="password"
                          name="api_key"
                          autoComplete="off"
                          minLength={8}
                          maxLength={4000}
                          required
                        />
                      </Field>
                      <Field label="Your current account password (reauthentication)">
                        <input
                          type="password"
                          name="password"
                          autoComplete="current-password"
                          maxLength={1024}
                          required
                        />
                      </Field>
                      <p>
                        Your existing MFA session and a fresh password check are
                        required. The key is encrypted on the server and never
                        returned. Reset the affected route and run a synthetic
                        test after changing credentials.
                      </p>
                      <SaveButton>Store encrypted key</SaveButton>
                    </form>
                  </details>
                )}
                {p &&
                  [
                    ...(models.data ?? []).filter(
                      (m) => m.provider_id === p.id,
                    ),
                    ...(owner ? [null] : []),
                  ].map((m) => (
                    <details key={m?.id ?? "new-model"} className="panel">
                      <summary>
                        {m?.model_id ?? "Add model"}
                        {m &&
                          ` · ${m.configuration_fault ? "Configuration fault" : m.circuit_until && Date.parse(m.circuit_until) > Date.now() ? "Circuit open" : (m.last_status ?? "Untested")}`}
                      </summary>
                      {m && (
                        <p>
                          Last check: {m.last_check_at ?? "Never"} · Latency:{" "}
                          {m.last_latency_ms ?? "—"} ms · Error:{" "}
                          {m.last_error_code ?? "—"}. A past success does not
                          guarantee current availability.
                        </p>
                      )}
                      {owner && (
                        <>
                          <form
                            action={action}
                            className="mt-4 grid gap-4 md:grid-cols-2"
                          >
                            <Hidden name="operation" value="model" />
                            <Hidden name="provider_id" value={p.id} />
                            {m && <Hidden name="id" value={m.id} />}
                            <Field label="Model ID">
                              <input
                                name="model_id"
                                maxLength={160}
                                required
                                defaultValue={m?.model_id}
                              />
                            </Field>
                            {Object.entries({
                              priority: [100, 0, 1000],
                              context_limit: [4096, 256, 2000000],
                              max_output_tokens: [512, 32, 16384],
                              price_in_per_million: [0, 0, 10000],
                              price_out_per_million: [0, 0, 10000],
                            }).map(([key, v]) => (
                              <Field key={key} label={key.replaceAll("_", " ")}>
                                <input
                                  type="number"
                                  name={key}
                                  min={v[1]}
                                  max={v[2]}
                                  step={
                                    key.startsWith("price") ? "0.000001" : "1"
                                  }
                                  defaultValue={m?.[key] ?? v[0]}
                                  required
                                />
                              </Field>
                            ))}
                            <fieldset>
                              <legend>Compatible purposes</legend>
                              {purposes.map((purpose) => (
                                <label key={purpose} className="block">
                                  <input
                                    name="purposes"
                                    type="checkbox"
                                    value={purpose}
                                    defaultChecked={
                                      m?.purposes.includes(purpose) ?? false
                                    }
                                  />
                                  {purpose}
                                </label>
                              ))}
                            </fieldset>
                            <label>
                              <input
                                name="enabled"
                                type="checkbox"
                                defaultChecked={m?.enabled ?? false}
                              />{" "}
                              Model enabled
                            </label>
                            <SaveButton />
                          </form>
                          {m && (
                            <div className="flex flex-wrap gap-4">
                              <form action={action}>
                                <Hidden name="id" value={m.id} />
                                <Hidden name="operation" value="test" />
                                <SaveButton>
                                  Test synthetic inference
                                </SaveButton>
                              </form>
                              <form action={action}>
                                <Hidden name="id" value={m.id} />
                                <Hidden name="operation" value="reset" />
                                <SaveButton>
                                  Reset route after fixing configuration
                                </SaveButton>
                              </form>
                            </div>
                          )}
                        </>
                      )}
                    </details>
                  ))}
              </section>
            ),
          )}
        </>
      )}
      {usageView && (
        <section className="panel">
          <h2>Usage by day, provider and model</h2>
          <form method="get" className="flex flex-wrap gap-3">
            <Hidden name="view" value="usage" />
            <Field label="Reporting window">
              <select name="days" defaultValue={days}>
                {[7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </Field>
            <SaveButton>Apply</SaveButton>
          </form>
          <p>
            UTC days including today. Every attempt counts, including failures
            and fallbacks. Token totals include only reported usage; a dash
            means unavailable. Showing up to 1,000 groups of{" "}
            {breakdown?.data?.total_groups ?? 0}. Latencies are milliseconds.
          </p>
          <div className="overflow-x-auto">
            <table>
              <caption>
                {breakdown?.data?.scope === "own" ? "Your" : "Club"} provider
                usage · {days} days
              </caption>
              <thead>
                <tr>
                  {[
                    "Day",
                    "Provider / model",
                    "Calls / failed",
                    "Input / output tokens",
                    "P50 / P95 ms",
                    "Reserved / estimated USD",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(breakdown?.data?.rows ?? []).map(
                  (row: {
                    usage_day: string;
                    provider: string;
                    model: string;
                    calls: number;
                    failed: number;
                    input_tokens: number | null;
                    output_tokens: number | null;
                    unknown_token_calls: number;
                    p50_ms: number | null;
                    p95_ms: number | null;
                    reserved_usd: number;
                    estimated_usd: number | null;
                  }) => (
                    <tr key={`${row.usage_day}:${row.provider}:${row.model}`}>
                      <th scope="row">{row.usage_day}</th>
                      <td>
                        {row.provider}
                        <br />
                        {row.model}
                      </td>
                      <td>
                        {row.calls} / {row.failed}
                      </td>
                      <td>
                        {row.input_tokens ?? "—"} / {row.output_tokens ?? "—"}
                        {row.unknown_token_calls > 0 && (
                          <small className="block">
                            {row.unknown_token_calls} incomplete
                          </small>
                        )}
                      </td>
                      <td>
                        {row.p50_ms?.toFixed(0) ?? "—"} /{" "}
                        {row.p95_ms?.toFixed(0) ?? "—"}
                      </td>
                      <td>
                        {Number(row.reserved_usd).toFixed(6)} /{" "}
                        {row.estimated_usd === null
                          ? "—"
                          : Number(row.estimated_usd).toFixed(6)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <h2>Recent usage and errors</h2>
          <p>
            Latest 100 visible attempts. Prompts, responses and credentials are
            excluded. Month budgets are enforced against the full ledger.
          </p>
          <ul>
            {(attempts.data ?? []).map((a) => (
              <li key={a.id} className="border-b py-3">
                <LocalDate value={a.created_at} /> · {a.purpose} · {a.status} ·{" "}
                {a.error_code ?? "—"} · {a.latency_ms ?? "—"} ms · reserved $
                {a.reserved_usd} · estimated $
                {a.estimated_cost_usd ?? "unknown"}
                <br />
                <small>Trace {a.trace_id}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
