"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
export async function updateDisplayName(form: FormData) {
  const value = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .safeParse(form.get("display_name"));
  if (!value.success) redirect("/account/security?notice=invalid");
  const { db, user } = await requireSession();
  const { error } = await db
    .from("profiles")
    .update({ display_name: value.data })
    .eq("id", user.id);
  redirect(`/account/security?notice=${error ? "invalid" : "saved"}`);
}
