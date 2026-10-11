"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});
export async function signIn(form: FormData) {
  const input = loginSchema.safeParse(Object.fromEntries(form));
  if (!input.success) redirect("/login?notice=invalid");
  const db = await createDatabaseClient();
  if (!db) redirect("/login?notice=configuration");
  const { error } = await db.auth.signInWithPassword(input.data);
  if (error) redirect("/login?notice=invalid");
  redirect("/workspace");
}
export async function signOut() {
  const db = await createDatabaseClient();
  if (db) await db.auth.signOut();
  redirect("/login");
}
