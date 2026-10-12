import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import {
  departments,
  departmentLabels,
  uuid,
} from "@/modules/program-rules/contracts";
import type { QuestionCandidate } from "@/modules/games/questions";
import { SaveButton } from "@/components/workspace/forms";
import { editQuestion } from "../../../actions";
export default async function EditQuestion({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; importId: string; row: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { clubId, importId, row } = await params;
  if (
    !uuid.safeParse(clubId).success ||
    !uuid.safeParse(importId).success ||
    !/^\d{1,3}$/.test(row)
  )
    notFound();
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/games`);
  const result = await db
    .from("question_imports")
    .select("*")
    .eq("club_id", clubId)
    .eq("id", importId)
    .maybeSingle();
  if (result.error) throw Error("Unable to load import");
  if (!result.data || result.data.status !== "preview") notFound();
  const job = result.data,
    candidate = (job.candidates as QuestionCandidate[])[Number(row)];
  if (!candidate) notFound();
  const q = candidate.question,
    mapping = job.mapping as {
      prompt: string;
      choices: string[];
      correct: string;
      explanation?: string;
      answerFormat: string;
    };
  const original = candidate.original;
  const answer = original[mapping.correct] ?? "";
  const choices = q?.choices ?? mapping.choices.map((h) => original[h] ?? "");
  const correct =
    q?.correct_index ??
    (mapping.answerFormat === "letter"
      ? answer.toUpperCase().charCodeAt(0) - 65
      : mapping.answerFormat === "one_based"
        ? Number(answer) - 1
        : choices.indexOf(answer));
  const back = `/workspace/${clubId}/games/import/${importId}`;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-6 px-5 py-10"
    >
      <Link href={back}>← Question preview</Link>
      <h1>Enrich CSV row {candidate.row}</h1>
      <p>
        Save a draft correction. Publication remains a separate review. Original
        source values are preserved.
      </p>
      {(await searchParams).notice && (
        <p role="alert">
          Check all fields. If another reviewer saved changes, reload before
          saving again.
        </p>
      )}
      <details className="panel">
        <summary>Original CSV values</summary>
        <dl>
          {Object.entries(original).map(([key, value]) => (
            <div key={key}>
              <dt className="font-semibold">{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <form
        action={editQuestion.bind(null, clubId, importId, Number(row))}
        className="panel grid gap-4"
      >
        <input type="hidden" name="revision" value={job.revision} />
        <label>
          Question
          <textarea
            name="prompt"
            required
            minLength={5}
            maxLength={2000}
            defaultValue={q?.prompt ?? original[mapping.prompt]}
          />
        </label>
        {Array.from({ length: 6 }, (_, i) => (
          <label key={i}>
            Option {String.fromCharCode(65 + i)}
            {i < 2
              ? " (required)"
              : " (optional; keep populated choices consecutive)"}
            <input
              name="choices"
              required={i < 2}
              maxLength={500}
              defaultValue={choices[i] ?? ""}
            />
          </label>
        ))}
        <label>
          Correct option
          <select
            name="correct_index"
            required
            defaultValue={correct >= 0 ? correct : ""}
          >
            <option value="" disabled>
              Choose an answer
            </option>
            {Array.from({ length: 6 }, (_, i) => (
              <option key={i} value={i}>
                {String.fromCharCode(65 + i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Explanation
          <textarea
            name="explanation"
            maxLength={3000}
            defaultValue={
              q?.explanation ?? original[mapping.explanation ?? ""] ?? ""
            }
          />
        </label>
        <label>
          Department
          <select
            name="department_code"
            required
            defaultValue={q?.department_code ?? ""}
          >
            <option value="" disabled>
              Review and choose
            </option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {departmentLabels[d]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select name="level" required defaultValue={q?.level ?? ""}>
            <option value="" disabled>
              Review and choose
            </option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select name="difficulty" required defaultValue={q?.difficulty ?? ""}>
            <option value="" disabled>
              Review and choose
            </option>
            {["introductory", "developing", "advanced"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Source reference
          <input
            name="source_reference"
            required
            maxLength={500}
            defaultValue={
              q?.source_reference ??
              `${job.file_name}, CSV row ${candidate.row}; verify manual reference`
            }
          />
        </label>
        <SaveButton>Save draft enrichment</SaveButton>
      </form>
    </main>
  );
}
