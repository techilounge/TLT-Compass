import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { gameModes, questionInput } from "@/modules/games/questions";
import { HostedQuiz } from "@/components/workspace/hosted-quiz";
export default async function GamesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, roles } = await requireClub(clubId),
    staff = roles.some((r) =>
      [
        "director",
        "coordinator",
        "primary_mentor",
        "operational_mentor",
      ].includes(r),
    );
  const bank = staff
    ? await db
        .from("quiz_questions")
        .select(
          "prompt,choices,correct_index,explanation,department_code,level,difficulty,source_reference",
        )
        .eq("club_id", clubId)
        .eq("status", "approved")
        .order("id")
        .limit(1000)
    : null;
  if (bank?.error) throw new Error("Unable to load approved questions");
  const questions = (bank?.data ?? []).map((q) => questionInput.parse(q));
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
      <h1>Games & leadership practice</h1>
      {roles.some((r) => ["director", "coordinator"].includes(r)) && (
        <Link href={`/workspace/${clubId}/games/teams`}>
          Supervised team challenges
        </Link>
      )}
      <Link href={`/workspace/${clubId}/games/results`}>
        Supervised sessions and result reviews
      </Link>
      <p>
        Practice supports learning and teamwork. Game results do not confer
        official completion. An authorized adult supervises activities and
        reviews real-world plans.
      </p>
      {staff && (
        <>
          <Link href={`/workspace/${clubId}/games/import`}>
            Import and review question CSV
          </Link>
          <HostedQuiz questions={questions} />
          <p>
            {questions.length} approved questions loaded, up to 1,000. This
            hosted screen includes answers for the adult facilitator;
            participant accounts cannot read the question bank.
          </p>
        </>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {gameModes.map((mode) => (
          <section key={mode.id} className="panel">
            <h2>{mode.name}</h2>
            <p>{mode.instructions}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
