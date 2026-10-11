"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserDatabaseClient } from "@/lib/db/browser";
import { Button } from "@/components/ui/button";
export function MfaForm({ accountLabel }: { accountLabel: string }) {
  const [factor, setFactor] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [qrCode, setQrCode] = useState<string>();
  const [authenticator, setAuthenticator] = useState("google");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const db = createBrowserDatabaseClient();
      const { data, error } = await db.auth.mfa.listFactors();
      if (error) throw error;
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) {
        setFactor(verified.id);
        return;
      }
      for (const pending of data.totp.filter((f) => f.status !== "verified")) {
        const removal = await db.auth.mfa.unenroll({ factorId: pending.id });
        if (removal.error) throw removal.error;
      }
      const enrollment = await db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "TLT Compass",
        issuer: "TLT Compass",
      });
      if (enrollment.error) throw enrollment.error;
      setFactor(enrollment.data.id);
      setSecret(enrollment.data.totp.secret);
      const svg = enrollment.data.totp.qr_code;
      const svgBody = svg.startsWith("data:image/svg+xml;")
        ? svg.slice(svg.indexOf(",") + 1)
        : svg;
      setQrCode(
        svg.startsWith("data:image/svg+xml;") &&
          !svgBody.trimStart().startsWith("<")
          ? svg
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgBody)}`,
      );
    } catch {
      setError("Unable to start verification. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function verify(form: FormData) {
    if (!factor) return;
    setBusy(true);
    setError("");
    try {
      const { error } =
        await createBrowserDatabaseClient().auth.mfa.challengeAndVerify({
          factorId: factor,
          code: String(form.get("code")),
        });
      if (error) throw error;
      setSecret(undefined);
      setQrCode(undefined);
      router.replace("/workspace");
      router.refresh();
    } catch {
      setError(
        "Verification failed. Use the latest six-digit code from the TLT Compass entry in your authenticator. Make sure your phone’s date and time are set automatically, then try the next code.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-8 space-y-5">
      <p className="text-muted-foreground">
        Use Google Authenticator or another app that supports time-based codes
        (TOTP), such as Microsoft Authenticator, Authy, or 1Password.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {!factor ? (
        <Button onClick={prepare} disabled={busy}>
          {busy ? "Preparing…" : "Continue with authenticator app"}
        </Button>
      ) : (
        <form action={verify} className="space-y-5">
          {secret && (
            <div className="notice">
              <label className="field-label">
                Authenticator app
                <select
                  value={authenticator}
                  onChange={(event) => setAuthenticator(event.target.value)}
                >
                  <option value="google">Google Authenticator</option>
                  <option value="other">Other authenticator app</option>
                </select>
              </label>
              <ol className="mt-4 list-decimal space-y-2 pl-5">
                <li>
                  {authenticator === "google"
                    ? "Open Google Authenticator, tap +, then Scan a QR code."
                    : "Open your authenticator app and choose to add an account by scanning a QR code."}
                </li>
                <li>Scan this QR code to add TLT Compass.</li>
                <li>Enter the six-digit code from the new entry below.</li>
              </ol>
              {qrCode && (
                <img
                  src={qrCode}
                  alt="Scan to add TLT Compass to your authenticator app"
                  width={240}
                  height={240}
                  className="mx-auto my-5 max-w-full rounded-lg bg-white p-3"
                />
              )}
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold">
                  Can’t scan? Enter a setup key
                </summary>
                <p className="mt-3">
                  Choose Enter a setup key in Google Authenticator, or manual
                  entry in another app. Use account name TLT Compass (
                  {accountLabel}) and select Time based.
                </p>
                <code className="mt-3 block break-all select-all">
                  {secret}
                </code>
              </details>
              <p className="mt-4 text-sm">
                Keep this QR code and setup key private. They give access to
                your verification codes.
              </p>
            </div>
          )}
          {!secret && (
            <p>
              Open your existing TLT Compass entry in Google Authenticator or
              the app you used during setup.
            </p>
          )}
          <label className="field-label">
            Authenticator code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>
        </form>
      )}
    </div>
  );
}
