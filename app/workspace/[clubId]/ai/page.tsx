import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { AIAssistant } from "@/components/workspace/ai-assistant";
export default async function AIPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, roles } = await requireClub(clubId);
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
  const { data, error } = await db
    .from("ai_settings")
    .select("enabled")
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) throw new Error("Unable to load AI settings");
  const versions = await db
    .from("program_rule_sets")
    .select("id,version,source_title")
    .eq("club_id", clubId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(100);
  if (versions.error) throw new Error("Unable to load approved sources");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
      <p className="eyebrow">{club.name} · Staff only</p>
      <h1>AI Integration</h1>
      <div className="panel">
        <h2>Provider and model controls</h2>
        <p>
          AI is{" "}
          {data?.enabled ? "enabled for configured staff requests" : "off"}.
          Core club workflows remain available.
        </p>
        <Link
          className="text-primary underline"
          href={`/workspace/${clubId}/ai/providers`}
        >
          Providers, model fallbacks, health and usage
        </Link>
      </div>
      <div className="panel">
        <h2>Assistant</h2>
        <p>
          The assistant retrieves only your selected approved rule version.
          Provider tests use a fixed synthetic prompt.
        </p>
        <p>
          AI suggestions will require human review. Official completion,
          eligibility, roles and points remain controlled by authorized people.
        </p>
      </div>
      <AIAssistant clubId={clubId} versions={versions.data ?? []} />
      {roles.some((r) => ["director", "coordinator"].includes(r)) && (
        <Link href={`/workspace/${clubId}/ai/proposals`}>
          Event proposals and human review
        </Link>
      )}
    </main>
  );
}
