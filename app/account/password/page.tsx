import { requireSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { updatePassword } from "./update";
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireSession();
  const { notice } = await searchParams;
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-3xl font-bold">Set your password</h1>
      <p className="mt-3 text-muted-foreground">
        Use at least 12 characters and a unique password.
      </p>
      {notice && (
        <p role="alert" className="notice mt-6">
          Password update failed. Try again or request a new invitation.
        </p>
      )}
      <form action={updatePassword} className="mt-6 space-y-5">
        <label className="field-label">
          New password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="field-label">
          Confirm password
          <input
            name="confirm"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <Button type="submit">Save password</Button>
      </form>
    </main>
  );
}
