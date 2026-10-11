import "server-only";
import { redirect } from "next/navigation";
import { createDatabaseClient } from "@/lib/db/server";
export async function requireSession() {
  const db = await createDatabaseClient();
  if (!db) redirect("/login?notice=configuration");
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { db, user: data.user };
}
export async function requireClub(clubId: string) {
  const { db, user } = await requireSession();
  const { data: club, error } = await db
    .from("clubs")
    .select("id,name,timezone")
    .eq("id", clubId)
    .maybeSingle();
  if (error || !club) redirect("/workspace?notice=access");
  const { data: effectiveRoles, error: membershipError } = await db.rpc(
    "effective_club_roles",
    { target_club: clubId },
  );
  if (membershipError) throw new Error("Unable to verify club membership.");
  return {
    db,
    user,
    club,
    roles: (effectiveRoles as string[] | null) ?? [],
  };
}
