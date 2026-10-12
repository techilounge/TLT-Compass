"use server";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
export async function uploadPdfCalendar(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/calendar`);
  let id: string | null = null;
  try {
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.size > 5 * 1024 * 1024 ||
      file.size < 5 ||
      !["application/pdf", "application/octet-stream", ""].includes(file.type)
    )
      throw new Error("Bounded PDF required");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("PDF signature required");
    const requestId = uuid.parse(form.get("request_id"));
    const result = await db.rpc("enqueue_pdf_calendar", {
      request_id: requestId,
      target_club: clubId,
      source_name: file.name.slice(0, 200),
      source_hash: createHash("sha256").update(bytes).digest("hex"),
      file_base64: bytes.toString("base64"),
      event_timezone: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .parse(form.get("timezone")),
    });
    if (!result.error) id = requestId;
  } catch {
    id = null;
  }
  redirect(
    id
      ? `/workspace/${clubId}/calendar/pdf/${id}`
      : `/workspace/${clubId}/calendar/import?notice=pdf-validation`,
  );
}
