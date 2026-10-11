import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import type { QuestionCandidate } from "@/modules/games/questions";
import { SaveButton } from "@/components/workspace/forms";
import { publishQuestions } from "../actions";
export default async function QuestionPreview({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; importId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId, importId } = await params;
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(importId).success)
    notFound();
  const { db, roles } = await requireClub(clubId);
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
    redirect(`/workspace/${clubId}`);
  const job = await db
    .from("question_imports")
    .select("*")
    .eq("club_id", clubId)
    .eq("id", importId)
    .maybeSingle();
  if (job.error) throw new Error("Unable to load question preview");
  if (!job.data) notFound();
  const data = job.data,
    rows = data.candidates as QuestionCandidate[],
    manager = roles.some((r) => ["director", "coordinator"].includes(r));
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-5xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/games/import`}>← Imports</Link>
      <h1>Review question import</h1>
      <p>
        {data.file_name} · {rows.length} rows · {data.status}
      </p>
      <p>Original headers: {(data.headers as string[]).join(" | ")}</p>
      <p>
        Review correctness, wording, age suitability and source context. No
        questions are published until an authorized manager confirms. Correct
        invalid source rows and upload a corrected file; select only valid
        reviewed rows here.
      </p>
      {(await searchParams).notice && (
        <p role="alert">
          Review selected rows. Duplicate or invalid questions cannot be
          published.
        </p>
      )}
      <form
        action={publishQuestions.bind(null, clubId, importId)}
        className="space-y-4"
      >
        {rows.map((row, index) => (
          <section key={row.row} className="panel">
            <h2>CSV row {row.row}</h2>
            {row.errors.map((e) => (
              <p key={e} className="notice">
                {e}
              </p>
            ))}
            {row.question && (
              <>
                <p>{row.question.prompt}</p>
                <ol>
                  {row.question.choices.map((choice, i) => (
                    <li key={i}>
                      {String.fromCharCode(65 + i)}. {choice}
                      {i === row.question!.correct_index
                        ? " · Correct answer"
                        : ""}
                    </li>
                  ))}
                </ol>
                <p>{row.question.explanation}</p>
                <small>
                  {row.question.department_code} · Level {row.question.level} ·{" "}
                  {row.question.difficulty} · {row.question.source_reference}
                </small>
              </>
            )}
            {data.status === "preview" && manager && (
              <label className="block">
                <input
                  name="rows"
                  type="checkbox"
                  value={index}
                  disabled={row.errors.length > 0 || !row.question}
                />{" "}
                Include this reviewed question
              </label>
            )}
          </section>
        ))}
        {data.status === "preview" && manager && (
          <div className="panel grid gap-4">
            <label>
              <input name="reviewed" type="checkbox" required /> I reviewed
              every selected prompt, answer, explanation and enrichment and
              approve publication to the staff question bank.
            </label>
            <SaveButton>Publish reviewed questions</SaveButton>
          </div>
        )}
      </form>
    </main>
  );
}
