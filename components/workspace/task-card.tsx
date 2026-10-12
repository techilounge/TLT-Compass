import { Button } from "@/components/ui/button";
import { Field, Hidden, SaveButton } from "./forms";
import {
  submitTask,
  reviewSubmission,
  transitionTask,
} from "@/app/workspace/[clubId]/actions";
export type TaskRow = {
  id: string;
  participant_id: string;
  requirement_id: string;
  title: string;
  instructions: string;
  due_on: string | null;
  status: string;
};
export type SubmissionRow = {
  id: string;
  task_id: string;
  version_no: number;
  evidence_text: string;
  reflection: string;
  activity_on: string;
};
export type ReviewRow = {
  submission_id: string;
  decision: string;
  feedback: string;
};
export function TaskCard({
  clubId,
  task: t,
  alias,
  own,
  isStaff,
  submissions,
  reviews,
  today,
}: {
  clubId: string;
  task: TaskRow;
  alias: string;
  own: boolean;
  isStaff: boolean;
  submissions: SubmissionRow[];
  reviews: ReviewRow[];
  today: string;
}) {
  const versions = submissions.filter((s) => s.task_id === t.id);
  const latest = versions[0];
  return (
    <article className="panel space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="text-xl font-bold">{t.title}</h3>
        <span className="badge">{t.status.replaceAll("_", " ")}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {alias} · {t.due_on ? `Due ${t.due_on}` : "No due date"}
      </p>
      <p className="whitespace-pre-wrap">{t.instructions}</p>
      {((own && t.status === "assigned") ||
        (isStaff &&
          !own &&
          [
            "draft",
            "assigned",
            "in_progress",
            "changes_requested",
            "verified",
          ].includes(t.status))) && (
        <form
          action={transitionTask.bind(null, clubId)}
          className="flex flex-wrap gap-3"
        >
          <Hidden name="task_id" value={t.id} />
          <Hidden name="expected_status" value={t.status} />
          {own && t.status === "assigned" && (
            <Button name="next_status" value="in_progress">
              Start task
            </Button>
          )}
          {isStaff && !own && t.status === "draft" && (
            <Button name="next_status" value="assigned">
              Assign draft
            </Button>
          )}
          {isStaff && !own && t.status === "verified" && (
            <Button name="next_status" value="closed">
              Close verified task
            </Button>
          )}
          {isStaff &&
            !own &&
            ["draft", "assigned", "in_progress", "changes_requested"].includes(
              t.status,
            ) && (
              <Button name="next_status" value="cancelled" variant="outline">
                Cancel task
              </Button>
            )}
        </form>
      )}
      {versions.map((s) => (
        <details
          key={s.id}
          open={t.status === "submitted" && s.id === latest.id}
        >
          <summary className="py-3 cursor-pointer font-semibold">
            Evidence version {s.version_no}
          </summary>
          <p className="whitespace-pre-wrap">{s.evidence_text}</p>
          <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
            Reflection: {s.reflection}
          </p>
          <p className="mt-3 text-xs">Activity: {s.activity_on}</p>
          {reviews
            .filter((r) => r.submission_id === s.id)
            .map((r) => (
              <p className="notice mt-3 text-sm" key={r.submission_id}>
                {r.decision.replaceAll("_", " ")}: {r.feedback}
              </p>
            ))}
        </details>
      ))}
      {own &&
        ["assigned", "in_progress", "changes_requested"].includes(t.status) && (
          <form action={submitTask.bind(null, clubId)} className="space-y-4">
            <Hidden name="task_id" value={t.id} />
            <Field label="What you did (evidence)">
              <textarea name="evidence" maxLength={10000} required />
            </Field>
            <Field label="What you learned (reflection)">
              <textarea name="reflection" maxLength={5000} required />
            </Field>
            <Field label="Activity date">
              <input name="activity_date" type="date" max={today} required />
            </Field>
            <SaveButton>Submit for mentor review</SaveButton>
          </form>
        )}
      {isStaff && !own && t.status === "submitted" && latest && (
        <form
          action={reviewSubmission.bind(null, clubId)}
          className="space-y-4"
        >
          <Hidden name="submission_id" value={latest.id} />
          <Field label="Mentor feedback">
            <textarea name="feedback" maxLength={5000} required />
          </Field>
          <label className="check-label">
            <input type="checkbox" required />I reviewed this evidence and am
            authorized to review this requirement.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button name="decision" value="changes_requested" variant="outline">
              Request changes
            </Button>
            <Button name="decision" value="verified">
              Verify requirement
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
