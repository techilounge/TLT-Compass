import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import {
  Field,
  SaveButton,
  DepartmentSelect,
} from "@/components/workspace/forms";
import { uploadQuestions } from "./actions";
export default async function QuestionImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
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
  const jobs = await db
    .from("question_imports")
    .select("id,file_name,status,created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (jobs.error) throw new Error("Unable to load question imports");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-4xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}/games`}>← Games</Link>
      <h1>Question CSV import</h1>
      <p>
        The referenced 226-question CSV has not been supplied in this workspace.
        Upload the actual file and map its exact headers. Original headers and
        rows are preserved privately; no SabiQuiz API or question dataset is
        assumed.
      </p>
      {(await searchParams).notice && (
        <p role="alert">
          Check UTF-8 CSV format, file size and exact header mapping.
        </p>
      )}
      <form
        action={uploadQuestions.bind(null, clubId)}
        className="panel grid gap-4 md:grid-cols-2"
      >
        <Field label="UTF-8 question CSV (up to 512 KiB)">
          <input type="file" name="file" accept=".csv,text/csv" required />
        </Field>
        <Field label="Question column header">
          <input name="prompt_column" maxLength={100} required />
        </Field>
        <Field label="Choice column headers, separated by | (2–6)">
          <input name="choice_columns" maxLength={600} required />
        </Field>
        <Field label="Correct-answer column header">
          <input name="answer_column" maxLength={100} required />
        </Field>
        <Field label="Explanation column header (optional)">
          <input name="explanation_column" maxLength={100} />
        </Field>
        <Field label="Answer format">
          <select name="answer_format">
            <option value="letter">Letters A–F in mapped choice order</option>
            <option value="one_based">
              Numbers 1–6 in mapped choice order
            </option>
            <option value="exact_text">Exact choice text</option>
          </select>
        </Field>
        <Field label="Department enrichment">
          <DepartmentSelect />
        </Field>
        <Field label="Level enrichment">
          <select name="level">
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Difficulty enrichment">
          <select name="difficulty">
            {["introductory", "developing", "advanced"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <p>
          Choose source-appropriate enrichment for this batch. Invalid rows
          remain in preview; staff must review every selected question and
          correct answer before publication.
        </p>
        <SaveButton>Preview questions</SaveButton>
      </form>
      <ul>
        {(jobs.data ?? []).map((j) => (
          <li key={j.id}>
            <Link href={`/workspace/${clubId}/games/import/${j.id}`}>
              {j.file_name} · {j.status} · {j.created_at}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
