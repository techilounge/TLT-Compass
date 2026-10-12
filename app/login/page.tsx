import Link from "next/link";
import { Button } from "@/components/ui/button";
import { parseSupabasePublicEnvironment } from "@/lib/validation/environment";
import { signIn } from "./actions";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const configured =
    parseSupabasePublicEnvironment(process.env).status === "configured";
  return (
    <main id="main" className="mx-auto max-w-lg px-5 py-16" tabIndex={-1}>
      <Link href="/" className="text-sm font-semibold text-primary">
        ← TLT Compass
      </Link>
      <h1 className="mt-8 text-3xl font-bold">Welcome back</h1>
      <p className="mt-3 text-muted-foreground">
        Sign in with your invited club account.
      </p>
      {!configured && (
        <p role="status" className="notice mt-6">
          Club sign-in is awaiting secure environment setup. You can explore the
          synthetic sandbox in the meantime.
        </p>
      )}
      {notice === "invalid" && (
        <p role="alert" className="notice mt-6">
          Unable to sign in. Check your credentials and try again.
        </p>
      )}
      {notice?.startsWith("email-link-") && (
        <p role="alert" className="notice mt-6">
          {notice === "email-link-expired"
            ? "This invitation or recovery link has expired or was already used. Request a fresh link and open it once on the computer running TLT Compass."
            : notice === "email-link-incomplete"
              ? "The email link did not include a complete session. Request a fresh invitation or recovery link."
              : "We could not establish your email-link session. Check your connection and request a fresh recovery link to finish password setup."}
        </p>
      )}
      <form action={signIn} className="mt-8 space-y-5">
        <label className="field-label">
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            disabled={!configured}
          />
        </label>
        <label className="field-label">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
            required
            disabled={!configured}
          />
        </label>
        <Button type="submit" disabled={!configured}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Need access or account recovery? Contact your club director. Account
        invitations are managed by authorized adults.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/sandbox">Explore sandbox</Link>
      </Button>
    </main>
  );
}
