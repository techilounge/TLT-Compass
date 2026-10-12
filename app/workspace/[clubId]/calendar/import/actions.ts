"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import {
  importColumns,
  parseCalendarCsv,
  type ImportMapping,
} from "@/modules/calendar/import-csv";
import { expandEvent } from "@/modules/calendar/events";
export async function saveImport(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, roles } = await requireClub(clubId);
  if (!roles.some((r) => ["director", "coordinator"].includes(r)))
    redirect(`/workspace/${clubId}/calendar`);
  let destination = `/workspace/${clubId}/calendar/import`;
  let notice = "validation";
  try {
    let result;
    if (form.get("operation") === "upload") {
      const file = form.get("file");
      if (
        !(file instanceof File) ||
        !file.name.toLowerCase().endsWith(".csv") ||
        file.size > 512 * 1024 ||
        file.size === 0 ||
        ![
          "",
          "text/csv",
          "application/csv",
          "text/plain",
          "application/vnd.ms-excel",
          "application/octet-stream",
        ].includes(file.type)
      )
        throw new Error("UTF-8 CSV file required");
      const bytes = await file.arrayBuffer(),
        source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const mapping = Object.fromEntries(
        importColumns.map((c) => [
          c,
          z
            .string()
            .trim()
            .max(100)
            .parse(form.get(`map_${c}`) ?? c),
        ]),
      ) as ImportMapping;
      const delimiter = z.enum([",", ";", "tab"]).parse(form.get("delimiter"));
      const zone = z
        .string()
        .trim()
        .min(1)
        .max(100)
        .parse(form.get("timezone"));
      const candidates = parseCalendarCsv(
        source,
        mapping,
        zone,
        delimiter === "tab" ? "\t" : delimiter,
      );
      const id = uuid.parse(form.get("request_id"));
      result = await db.rpc("create_calendar_import", {
        request_id: id,
        target_club: clubId,
        source_name: file.name.slice(0, 200),
        source_hash: createHash("sha256")
          .update(Buffer.from(bytes))
          .digest("hex"),
        source_text: source,
        column_mapping: mapping,
        parsed_candidates: candidates,
      });
      if (!result.error) destination += `/${id}`;
    } else {
      const id = uuid.parse(form.get("import_id"));
      const scoped = await db
        .from("calendar_imports")
        .select("id")
        .eq("club_id", clubId)
        .eq("id", id)
        .maybeSingle();
      if (scoped.error || !scoped.data) throw new Error("Import unavailable");
      destination += `/${id}`;
      if (form.get("operation") === "edit_row") {
        const payload = expandEvent({
          ...Object.fromEntries(form),
          all_day: form.get("all_day") === "on",
        });
        result = await db.rpc("edit_calendar_import_row", {
          target_import: id,
          row_index: z.coerce
            .number()
            .int()
            .min(0)
            .max(499)
            .parse(form.get("row_index")),
          expected_revision: z.coerce
            .number()
            .int()
            .positive()
            .parse(form.get("revision")),
          event_payload: payload,
        });
      } else if (form.get("operation") === "publish") {
        const selected = z
          .array(z.coerce.number().int().min(0).max(499))
          .min(1)
          .max(500)
          .parse(form.getAll("selected_rows"));
        result = await db.rpc("publish_calendar_import", {
          target_import: id,
          expected_revision: z.coerce
            .number()
            .int()
            .positive()
            .parse(form.get("revision")),
          selected_rows: selected,
          conflicts_reviewed: form.get("reviewed") === "on",
        });
      } else if (form.get("operation") === "rollback")
        result = await db.rpc("rollback_calendar_import", {
          target_import: id,
        });
      else throw new Error("Invalid operation");
    }
    notice = result.error ? "validation" : "saved";
  } catch {
    notice = "validation";
  }
  revalidatePath(`/workspace/${clubId}/calendar`, "layout");
  redirect(`${destination}?notice=${notice}`);
}
