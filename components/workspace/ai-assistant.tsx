"use client";
import { useState } from "react";
import { Field } from "./forms";
import { Button } from "@/components/ui/button";
type Reply = {
  answer: string;
  uncertain: boolean;
  retrieved_count: number;
  available_count: number;
  sources: {
    id: string;
    title: string;
    page: string;
    section: string;
    description: string;
  }[];
};
export function AIAssistant({
  clubId,
  versions,
}: {
  clubId: string;
  versions: { id: string; version: number; source_title: string }[];
}) {
  const [reply, setReply] = useState<Reply | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel space-y-4">
      <h2>Source-linked staff assistant</h2>
      <p>
        Scope: selected approved club rule version only. No participant
        profiles, private notes or attendance reasons are retrieved. Do not
        include personal information in your question. This answer does not
        approve requirements or replace cited policy.
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
            const response = await fetch(`/workspace/${clubId}/ai/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rule_set_id: form.get("rule_set_id"),
                question: form.get("question"),
                confirmed: form.get("confirmed") === "on",
              }),
            });
            if (!response.ok) throw new Error();
            setReply((await response.json()) as Reply);
          } catch {
            setError(
              "The assistant could not answer. Check approved sources, provider availability and budget. Core workflows remain available.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Approved rule version">
          <select name="rule_set_id" required>
            <option value="">Choose a version</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Version {v.version} · {v.source_title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Question about these requirements">
          <textarea name="question" required minLength={3} maxLength={2000} />
        </Field>
        <label>
          <input type="checkbox" name="confirmed" required /> Send this question
          and selected rule excerpts to an approved configured AI provider.
        </label>
        <Button type="submit" disabled={busy || !versions.length}>
          {busy ? "Checking sources…" : "Ask assistant"}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {reply && (
        <div aria-live="polite">
          <p className="whitespace-pre-wrap">{reply.answer}</p>
          <p className="mt-3 text-sm">
            Checked {reply.retrieved_count} of {reply.available_count}{" "}
            requirement excerpts, selected by wording relevance. Omitted sources
            may contain relevant policy; verify the original manual.
          </p>
          {reply.uncertain && (
            <p className="notice">
              Uncertainty reported. Ask the director to review the cited
              sources.
            </p>
          )}
          <ul>
            {reply.sources.map((s) => (
              <li key={s.id} className="mt-4">
                <strong>
                  {s.title} · page {s.page} · {s.section}
                </strong>
                <p>{s.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
