import { requireSession } from "@/lib/auth/session";
import { MfaForm } from "@/components/auth/mfa-form";
import { updateDisplayName } from "./actions";
import { Button } from "@/components/ui/button";
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { db, user } = await requireSession();
  const { notice } = await searchParams;
  const { data: profile, error } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Unable to load account profile.");
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-3xl font-bold">Protect your club account</h1>
      <p className="mt-3 text-muted-foreground">
        Adult access requires an authenticator code in addition to your
        password.
      </p>
      <MfaForm accountLabel={user.email ?? "Club account"} />
      <section className="panel mt-8">
        <h2 className="text-xl font-bold">Your display name</h2>
        {notice && (
          <p role="status" className="notice mt-4">
            {notice === "saved"
              ? "Display name saved."
              : "Unable to save. Use 1–80 characters."}
          </p>
        )}
        <form action={updateDisplayName} className="mt-5 space-y-4">
          <label className="field-label">
            Display name
            <input
              name="display_name"
              maxLength={80}
              defaultValue={profile.display_name}
              required
            />
          </label>
          <Button>Save display name</Button>
        </form>
      </section>
    </main>
  );
}
