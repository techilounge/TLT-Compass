import "server-only";
import { Client } from "pg";
import { AIError } from "@/modules/ai/contracts";
export type VerifiedAIClaims = { sub: string; aal: string };
export async function withAIConnection<T>(
  claims: VerifiedAIClaims,
  operation: (client: Client) => Promise<T>,
) {
  const raw = process.env.AI_RUNTIME_DB_URL;
  if (!raw) throw new AIError("unavailable");
  const target = new URL(raw),
    project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(
      ".",
    )[0];
  if (
    target.username !== "tlt_ai_runtime" ||
    target.hostname !== `db.${project}.supabase.co`
  )
    throw new AIError("configuration");
  const client = new Client({
    connectionString: raw,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await client.query("begin");
    await client.query("set local statement_timeout='5s'");
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [claims.sub, JSON.stringify(claims)],
    );
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch {
    await client.query("rollback").catch(() => {});
    throw new AIError("unavailable");
  } finally {
    await client.end().catch(() => {});
  }
}
