import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { Field, Hidden, SaveButton } from "@/components/workspace/forms";
import { providerTypes, purposes } from "@/modules/ai/contracts";
import { configureAI } from "./actions";
export default async function ProvidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string }>;
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
        .limit(100),
      db
        .from("ai_models")
        .select("*")
        .eq("club_id", clubId)
        .order("priority")
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
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/ai`}>← AI Integration</Link>
      <p className="eyebrow">{club.name}</p>
      <h1>AI providers & models</h1>
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
              monthly_budget_usd: [0, 0, 10000, "Monthly club ceiling (USD)"],
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
              cooldown_seconds: [300, 30, 86400, "Circuit cooldown (seconds)"],
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
              interrupted attempts. Estimated token cost is shown separately.
            </p>
            <SaveButton />
          </form>
        </details>
      )}
      {[...(providers.data ?? []), ...(owner ? [null] : [])].map((p) => (
        <section key={p?.id ?? "new"} className="panel space-y-4">
          <h2>{p ? p.name : "Add provider"}</h2>
          {owner ? (
            <form action={action} className="grid gap-4 md:grid-cols-2">
              <Hidden name="operation" value="provider" />
              {p && <Hidden name="id" value={p.id} />}
              <Field label="Name">
                <input
                  name="name"
                  maxLength={80}
                  defaultValue={p?.name}
                  required
                />
              </Field>
              <Field label="Provider type">
                <select name="provider_type" defaultValue={p?.provider_type}>
                  {providerTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Allowlisted HTTPS API base URL">
                <input
                  name="base_url"
                  type="url"
                  defaultValue={p?.base_url}
                  required
                />
              </Field>
              <Field label="Server credential reference">
                <input
                  name="credential_secret_ref"
                  pattern="AI_SECRET_[A-Z0-9_]+"
                  placeholder="AI_SECRET_PROVIDER_NAME"
                  defaultValue={p?.credential_secret_ref}
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
                reference. Never paste an API key into the reference field.
                Model IDs and prices are explicitly configured; no provider
                price is assumed.
              </p>
              <SaveButton />
            </form>
          ) : (
            <p>
              Priority {p?.priority} · {p?.enabled ? "Enabled" : "Disabled"} ·{" "}
              {p?.provider_type}
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
                  returned. Reset the affected route and run a synthetic test
                  after changing credentials.
                </p>
                <SaveButton>Store encrypted key</SaveButton>
              </form>
            </details>
          )}
          {p &&
            [
              ...(models.data ?? []).filter((m) => m.provider_id === p.id),
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
                            step={key.startsWith("price") ? "0.000001" : "1"}
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
                          <SaveButton>Test synthetic inference</SaveButton>
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
      ))}
      <section className="panel">
        <h2>Recent usage and errors</h2>
        <p>
          Latest 100 visible attempts. Prompts, responses and credentials are
          excluded. Month budgets are enforced against the full ledger.
        </p>
        <ul>
          {(attempts.data ?? []).map((a) => (
            <li key={a.id} className="border-b py-3">
              {a.created_at} · {a.purpose} · {a.status} · {a.error_code ?? "—"}{" "}
              · {a.latency_ms ?? "—"} ms · reserved ${a.reserved_usd} ·
              estimated ${a.estimated_cost_usd ?? "unknown"}
              <br />
              <small>Trace {a.trace_id}</small>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
