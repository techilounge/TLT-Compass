"use server";
import { randomUUID, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { departments, uuid } from "@/modules/program-rules/contracts";
import { parseQuestionCsv, questionInput } from "@/modules/games/questions";
export async function uploadQuestions(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
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
  let destination = `/workspace/${clubId}/games/import?notice=validation`;
  try {
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".csv") ||
      file.size < 1 ||
      file.size > 512 * 1024
    )
      throw new Error();
    const source = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      ),
      header = (key: string) => z.string().min(1).max(100).parse(form.get(key));
    const mapping = {
      prompt: header("prompt_column"),
      choices: z
        .string()
        .min(1)
        .max(600)
        .parse(form.get("choice_columns"))
        .split("|")
        .map((s) => s.trim()),
      correct: header("answer_column"),
      explanation: z
        .string()
        .max(100)
        .parse(form.get("explanation_column") ?? ""),
    };
    const options = {
      answerFormat: z
        .enum(["letter", "one_based", "exact_text"])
        .parse(form.get("answer_format")),
      department: z.enum(departments).parse(form.get("department_code")),
      level: z.coerce.number().int().min(1).max(4).parse(form.get("level")),
      difficulty: z
        .enum(["introductory", "developing", "advanced"])
        .parse(form.get("difficulty")),
      sourceName: file.name.slice(0, 200),
    };
    const parsed = parseQuestionCsv(source, mapping, options),
      id = randomUUID();
    const result = await db.rpc("save_question_import", {
      request_id: id,
      target_club: clubId,
      source_name: options.sourceName,
      source_hash: createHash("sha256").update(source).digest("hex"),
      source_text: source,
      column_mapping: { ...mapping, ...options },
      source_headers: parsed.headers,
      parsed_candidates: parsed.candidates,
    });
    if (result.error) throw new Error();
    destination = `/workspace/${clubId}/games/import/${id}`;
  } catch {
    /* Never log source CSV contents. */
  }
  revalidatePath(`/workspace/${clubId}/games`, "layout");
  redirect(destination);
}
export async function publishQuestions(
  clubId: string,
  id: string,
  form: FormData,
) {
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(id).success)
    redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/games`);
  const job = await db
    .from("question_imports")
    .select("id")
    .eq("club_id", clubId)
    .eq("id", id)
    .single();
  if (job.error) redirect(`/workspace/${clubId}/games`);
  const selected = z
    .array(z.coerce.number().int().min(0).max(999))
    .min(1)
    .max(1000)
    .safeParse(form.getAll("rows"));
  if (!selected.success)
    redirect(`/workspace/${clubId}/games/import/${id}?notice=review`);
  const result = await db.rpc("publish_question_import", {
    target_import: id,
    selected_rows: selected.data,
    reviewed: form.get("reviewed") === "on",
  });
  if (result.error)
    redirect(`/workspace/${clubId}/games/import/${id}?notice=review`);
  revalidatePath(`/workspace/${clubId}/games`, "layout");
  redirect(`/workspace/${clubId}/games/import/${id}`);
}

export async function editQuestion(
  clubId: string,
  importId: string,
  row: number,
  form: FormData,
) {
  if (!uuid.safeParse(clubId).success || !uuid.safeParse(importId).success)
    redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/games`);
  const choices = form.getAll("choices").map((value) => String(value).trim());
  while (choices.length && choices.at(-1) === "") choices.pop();
  const answer = z
    .string()
    .regex(/^[0-5]$/)
    .safeParse(form.get("correct_index"));
  const payload = questionInput.safeParse({
    prompt: form.get("prompt"),
    choices,
    correct_index: answer.success ? Number(answer.data) : -1,
    explanation: form.get("explanation"),
    department_code: form.get("department_code"),
    level: Number(form.get("level")),
    difficulty: form.get("difficulty"),
    source_reference: form.get("source_reference"),
  });
  const revision = z.coerce
    .number()
    .int()
    .min(0)
    .safeParse(form.get("revision"));
  const destination = `/workspace/${clubId}/games/import/${importId}`;
  if (!payload.success || !revision.success)
    redirect(`${destination}/rows/${row}?notice=validation`);
  const result = await db.rpc("edit_question_candidate", {
    target_import: importId,
    row_index: row,
    expected_revision: revision.data,
    payload: payload.data,
  });
  revalidatePath(destination);
  if (result.error) redirect(`${destination}/rows/${row}?notice=conflict`);
  redirect(destination);
}
