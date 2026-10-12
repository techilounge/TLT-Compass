"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Compass,
  BookOpen,
  ClipboardCheck,
  Users,
  ArrowUpRight,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/workspace/forms";
type Actor = "director" | "participant" | "mentor";
type Evidence = {
  version: number;
  evidence: string;
  reflection: string;
  feedback?: string;
  decision?: "changes_requested" | "verified";
};
type PracticeTask = {
  title: string;
  instructions: string;
  status: "assigned" | "submitted" | "changes_requested" | "verified";
};
export function Sandbox() {
  const [actor, setActor] = useState<Actor>("director");
  const [task, setTask] = useState<PracticeTask>();
  const [versions, setVersions] = useState<Evidence[]>([]);
  const [message, setMessage] = useState(
    "Start as director and assign a practice task.",
  );
  const verified = task?.status === "verified";
  const latest = versions.at(-1);
  function reset() {
    setTask(undefined);
    setVersions([]);
    setActor("director");
    setMessage("Sandbox reset. Assign a practice task to begin.");
  }
  function assign(form: FormData) {
    if (actor !== "director" || task) return;
    setTask({
      title: String(form.get("title")),
      instructions: String(form.get("instructions")),
      status: "assigned",
    });
    setMessage("Task assigned. Switch to participant to submit evidence.");
  }
  function submit(form: FormData) {
    if (
      actor !== "participant" ||
      !task ||
      !["assigned", "changes_requested"].includes(task.status)
    )
      return;
    setVersions([
      ...versions,
      {
        version: versions.length + 1,
        evidence: String(form.get("evidence")),
        reflection: String(form.get("reflection")),
      },
    ]);
    setTask({ ...task, status: "submitted" });
    setMessage("Evidence submitted. Switch to mentor to review it.");
  }
  function review(form: FormData) {
    if (actor !== "mentor" || task?.status !== "submitted" || !latest) return;
    const decision = form.get("decision");
    if (decision !== "verified" && decision !== "changes_requested") return;
    setVersions(
      versions.map((v) =>
        v.version === latest.version
          ? { ...v, feedback: String(form.get("feedback")), decision }
          : v,
      ),
    );
    setTask({ ...task, status: decision });
    setMessage(
      decision === "verified"
        ? "Practice requirement verified by Demo Mentor. The checklist now includes a signed review."
        : "Changes requested. Switch to participant to revise and resubmit.",
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-3 text-lg font-bold"
        >
          <Compass className="text-primary" aria-hidden="true" />
          TLT Compass
        </Link>
        <Button asChild variant="outline">
          <Link href="/login">
            Club sign-in
            <ArrowUpRight className="ml-2 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </header>
      <div className="workspace-layout">
        <aside>
          <nav aria-label="Sandbox navigation" className="club-nav">
            <a href="#main">Overview</a>
            <a href="#demo-record">Record Book</a>
            <a href="#demo-task">Tasks & reviews</a>
            <a href="#demo-version">Program rules</a>
          </nav>
          <div className="mt-6 rounded-xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-bold text-foreground">North Star Sandbox</p>
            <p className="mt-2">
              Synthetic club · one participant
              <br />
              No live accounts or records
            </p>
          </div>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 space-y-8 pb-16">
          <section>
            <p className="eyebrow">Learning to lead, together</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              Every step has a purpose.
            </h1>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              Follow one task from assignment to reflection and mentor sign-off.
              Explore each person’s part in the journey.
            </p>
          </section>
          <section aria-labelledby="sandbox-heading" className="notice">
            <div className="flex flex-wrap justify-between gap-3">
              <h2 id="sandbox-heading" className="font-bold">
                Synthetic sandbox
              </h2>
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-primary"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Reset sandbox
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Practice only. Nothing here is saved or sent to a server. Use
              invented examples. Switching views demonstrates the workflow; it
              grants no access to club data.
            </p>
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="group"
              aria-label="Practice role"
            >
              {(["director", "participant", "mentor"] as Actor[]).map(
                (role) => (
                  <Button
                    key={role}
                    variant={actor === role ? "default" : "outline"}
                    aria-pressed={actor === role}
                    onClick={() => setActor(role)}
                  >
                    {role[0].toUpperCase() + role.slice(1)} view
                  </Button>
                ),
              )}
            </div>
            <p role="status" className="mt-4 text-sm font-semibold">
              {message}
            </p>
          </section>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [Users, "Participants", "1"],
              [
                ClipboardCheck,
                "Tasks awaiting review",
                task?.status === "submitted" ? "1" : "0",
              ],
              [BookOpen, "Practice checklist", verified ? "1 / 1" : "0 / 1"],
            ].map(([Icon, label, value]) => {
              const Glyph = Icon as typeof Users;
              return (
                <div className="panel" key={String(label)}>
                  <Glyph aria-hidden="true" className="size-5 text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    {String(label)}
                  </p>
                  <p className="mt-2 text-3xl font-bold">{String(value)}</p>
                </div>
              );
            })}
          </div>
          <section id="demo-record" className="panel scroll-mt-6">
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="eyebrow">Digital Record Book</p>
                <h2 className="mt-3 text-2xl font-bold">Trailblazer Demo</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Level 1 · Outreach · Primary mentor: Demo Mentor
                </p>
              </div>
              <span className="badge h-fit">Synthetic participant</span>
            </div>
            <div className="mt-6 rounded-xl bg-muted p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">
                  Plan a supervised service activity
                </h3>
                <span className="badge">
                  {verified ? "Verified" : "Awaiting mentor sign-off"}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Practice rule version: sandbox-v1 · Source: original synthetic
                exercise
              </p>
              {verified && (
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  Reviewed by Demo Mentor · Evidence version {latest?.version}
                </p>
              )}
              <p className="mt-4 text-sm text-muted-foreground">
                Points never replace a reviewed requirement. A completed task
                does not automatically promote a participant.
              </p>
            </div>
          </section>
          <section id="demo-task" className="scroll-mt-6 space-y-5">
            <h2 className="text-2xl font-bold">Tasks & mentor reviews</h2>
            {!task ? (
              <div className="panel">
                {actor === "director" ? (
                  <form action={assign} className="space-y-5">
                    <Field label="Task title">
                      <input
                        name="title"
                        maxLength={160}
                        defaultValue="Plan a supervised service activity"
                        required
                      />
                    </Field>
                    <Field label="Instructions">
                      <textarea
                        name="instructions"
                        maxLength={5000}
                        defaultValue="Describe your activity, the supervising adult, and how your team will share responsibilities."
                        required
                      />
                    </Field>
                    <Button>Assign practice task</Button>
                  </form>
                ) : (
                  <p className="text-muted-foreground">
                    Switch to director view to assign the first practice task.
                  </p>
                )}
              </div>
            ) : (
              <article className="panel space-y-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <h3 className="text-xl font-bold">{task.title}</h3>
                  <span className="badge">
                    {task.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {task.instructions}
                </p>
                {versions.map((v) => (
                  <div
                    className="rounded-xl border border-border p-5"
                    key={v.version}
                  >
                    <h4 className="font-bold">Evidence version {v.version}</h4>
                    <p className="mt-3 whitespace-pre-wrap">{v.evidence}</p>
                    <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
                      Reflection: {v.reflection}
                    </p>
                    {v.decision && (
                      <p className="notice mt-4 text-sm">
                        Demo Mentor · {v.decision.replaceAll("_", " ")}
                        <br />
                        {v.feedback}
                      </p>
                    )}
                  </div>
                ))}
                {actor === "participant" &&
                  ["assigned", "changes_requested"].includes(task.status) && (
                    <form action={submit} className="space-y-5">
                      <Field label="What you did (evidence)">
                        <textarea name="evidence" maxLength={10000} required />
                      </Field>
                      <Field label="What you learned (reflection)">
                        <textarea name="reflection" maxLength={5000} required />
                      </Field>
                      <Button>Submit for mentor review</Button>
                    </form>
                  )}
                {actor === "mentor" && task.status === "submitted" && (
                  <form action={review} className="space-y-5">
                    <Field label="Mentor feedback">
                      <textarea name="feedback" maxLength={5000} required />
                    </Field>
                    <label className="check-label">
                      <input type="checkbox" required />I reviewed the practice
                      evidence.
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        name="decision"
                        value="changes_requested"
                        variant="outline"
                      >
                        Request changes
                      </Button>
                      <Button name="decision" value="verified">
                        Verify practice requirement
                      </Button>
                    </div>
                  </form>
                )}
                {actor === "director" && (
                  <p className="notice text-sm">
                    Next: switch to{" "}
                    {task.status === "submitted" ? "mentor" : "participant"}{" "}
                    view to continue the practice flow.
                  </p>
                )}
                {verified && (
                  <p role="status" className="notice">
                    The practice checklist has a reviewed requirement. Start a
                    new example with Reset sandbox.
                  </p>
                )}
              </article>
            )}
          </section>
          <section id="demo-version" className="panel scroll-mt-6">
            <h2 className="text-xl font-bold">
              Versioned requirements, clear sources
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              The connected workspace supports draft curriculum versions with
              configurable onboarding criteria and source references. A director
              approves a version before it can support admission or task
              assignment. Approved history is frozen; changes use a new version.
            </p>
            <p className="mt-4 text-sm font-semibold">
              This sandbox exercise is invented and makes no claim of official
              TLT compliance.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
