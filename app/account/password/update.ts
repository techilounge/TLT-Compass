"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
export async function updatePassword(form: FormData) {
  const schema = z
    .object({ password: z.string().min(12).max(128), confirm: z.string() })
    .refine((v) => v.password === v.confirm);
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/account/password?notice=invalid");
  const { db } = await requireSession();
  const { error } = await db.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) redirect("/account/password?notice=invalid");
  redirect("/account/security");
}
