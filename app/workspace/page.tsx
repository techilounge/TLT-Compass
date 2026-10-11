import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";
export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { db, user } = await requireSession();
  const { notice } = await searchParams;
  const { data: clubs, error } = await db
    .from("clubs")
    .select("id,name")
    .order("name");
  const { data: memberships, error: membershipError } = await db
    .from("club_memberships")
    .select("role")
    .eq("profile_id", user.id)
    .eq("status", "active");
  if (error || membershipError) throw new Error("Unable to load club access.");
  const hasAdultRole = memberships?.some((m) => m.role !== "participant");
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-5 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Your club workspace</h1>
        <form action={signOut}>
          <Button variant="outline">Sign out</Button>
        </form>
      </div>
      {notice && (
        <p role="status" className="notice mt-6">
          This club is unavailable for your current access.
        </p>
      )}
      <div className="mt-8 grid gap-4">
        {clubs?.map((club) => (
          <Link
            key={club.id}
            href={`/workspace/${club.id}`}
            className="panel block font-semibold"
          >
            {club.name} →
          </Link>
        ))}
      </div>
      {!clubs?.length && (
        <section className="panel mt-8">
          <h2 className="text-xl font-bold">Your workspace is waiting</h2>
          <p className="mt-3 text-muted-foreground">
            {hasAdultRole
              ? "Verify your authenticator to open eligible adult club access."
              : "Ask your director to confirm your club membership."}
          </p>
          {hasAdultRole && (
            <Button asChild className="mt-5">
              <Link href="/account/security">Verify authenticator</Link>
            </Button>
          )}
        </section>
      )}
    </main>
  );
}
