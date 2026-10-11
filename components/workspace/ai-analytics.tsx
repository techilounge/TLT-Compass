"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
type Reply = {
  observations: { metric: string; comment: string }[];
  limitations: string[];
  metrics: Record<string, number>;
  generated_at: string;
};
export function AIAnalytics({
  clubId,
  seasons,
}: {
  clubId: string;
  seasons: { id: string; name: string }[];
}) {
  const [reply, setReply] = useState<Reply | null>(null),
    [preview, setPreview] = useState<{
      metrics: Record<string, number>;
      preview_token: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel space-y-4">
      <h2>Read-only analytics assistant</h2>
      <p>
        Explains current aggregate counts through fixed database queries. No
        names, participant IDs, evidence, attendance reasons or mentor caseloads
        are sent. Configured cohort limits suppress small counts; aggregation
        does not guarantee anonymity. Confirm your club's communication and
        privacy policy before sending.
      </p>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          setReply(null);
          try {
            if (!preview) {
              const response = await fetch(
                `/workspace/${clubId}/ai/analytics?${new URLSearchParams({ season_id: String(form.get("season_id") ?? "") })}`,
                { cache: "no-store" },
              );
              if (!response.ok) throw Error();
              setPreview(await response.json());
              return;
            }
            const response = await fetch(`/workspace/${clubId}/ai/analytics`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                season_id: form.get("season_id") || null,
                focus: form.get("focus"),
                confirmed: form.get("confirmed") === "on",
                preview_token: preview.preview_token,
              }),
            });
            if (!response.ok) throw Error();
            setReply(await response.json());
          } catch {
            setPreview(null);
            setError(
              "Unable to analyze this scope. Check the configured minimum cohort, provider availability, switches and budget.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Season
          <select
            name="season_id"
            onChange={() => {
              setPreview(null);
              setReply(null);
            }}
          >
            <option value="">All accessible seasons</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Focus
          <select name="focus">
            <option value="completion">Requirement completion</option>
            <option value="review_backlog">Review backlog</option>
            <option value="participation">Participation</option>
          </select>
        </label>
        {preview && (
          <>
            <table>
              <caption>Exact aggregate values to send</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.metrics).map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row">{key.replaceAll("_", " ")}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label>
              <input type="checkbox" name="confirmed" required /> Send this
              selected aggregate snapshot to an approved configured AI provider.
              I have reviewed the applicable privacy policy.
            </label>
          </>
        )}
        <Button disabled={busy}>
          {busy
            ? "Working…"
            : preview
              ? "Explain reviewed counts"
              : "Preview aggregate counts"}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {reply && (
        <div aria-live="polite" className="space-y-4">
          <p className="notice">
            Check interpretations against these exact snapshot values. AI does
            not establish trends or causes and cannot change records.
          </p>
          <ul>
            {reply.observations.map((item, i) => (
              <li key={i}>
                <strong>
                  {item.metric.replaceAll("_", " ")}:{" "}
                  {reply.metrics[item.metric]}
                </strong>
                <p>{item.comment}</p>
              </li>
            ))}
          </ul>
          <ul>
            {reply.limitations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
