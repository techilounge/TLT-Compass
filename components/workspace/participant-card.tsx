import Link from "next/link";
import { Button } from "@/components/ui/button";
import type {
  ParticipantRecord,
  RuleRecord,
} from "@/modules/program-rules/contracts";
import { onboardingChecks } from "@/modules/participants/onboarding";
import { Field, Hidden, DepartmentSelect, SaveButton } from "./forms";
import {
  updateOnboarding,
  assignMentor,
  admitParticipant,
  addRotation,
} from "@/app/workspace/[clubId]/actions";
export type MentorRow = {
  id: string;
  participant_id: string;
  mentor_profile_id: string;
  assignment_type: string;
  state: string;
};
export function ParticipantCard({
  clubId,
  participant: p,
  rule,
  mentors,
  adultOptions,
  names,
  isManager,
  isDirector,
  today,
  children,
}: {
  clubId: string;
  participant: ParticipantRecord;
  rule?: RuleRecord;
  mentors: MentorRow[];
  adultOptions: string[];
  names: Map<string, string>;
  isManager: boolean;
  isDirector: boolean;
  today: string;
  children: React.ReactNode;
}) {
  const assigned = mentors.filter(
    (m) => m.participant_id === p.id && m.state === "active",
  );
  const checks = rule
    ? onboardingChecks(
        p,
        rule,
        assigned.some((m) => m.assignment_type === "primary"),
        today,
      )
    : [];
  return (
    <article className="panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">
            <Link href={`/workspace/${clubId}?participant=${p.id}#roster`}>
              {p.public_alias}
            </Link>
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Level {p.current_level} · Grade {p.grade_level}
          </p>
        </div>
        <span className="badge">{p.status}</span>
      </div>
      <p className="text-sm">
        <Link
          className="text-primary underline"
          href={`/workspace/${clubId}/record-book/${p.id}`}
        >
          Open departmental Record Book
        </Link>
      </p>
      <p className="text-sm">
        Rule version: <strong>{rule?.version ?? "Unavailable"}</strong> ·{" "}
        {rule?.status ?? "unavailable"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {checks.map((c) => (
          <p className="text-sm" key={c.label}>
            <span aria-hidden="true">{c.complete ? "✓" : "○"}</span> {c.label}
            <span className="sr-only">
              {" "}
              {c.complete ? "complete" : "incomplete"}
            </span>
          </p>
        ))}
      </div>
      {assigned.map((m) => (
        <p className="text-sm text-muted-foreground" key={m.id}>
          {m.assignment_type} mentor:{" "}
          {names.get(m.mentor_profile_id) ?? "Assigned adult"}
        </p>
      ))}
      {children}
      {isManager && (
        <details>
          <summary className="py-3 font-semibold cursor-pointer">
            Update onboarding evidence
          </summary>
          <form
            action={updateOnboarding.bind(null, clubId)}
            className="form-grid mt-4"
          >
            <Hidden name="participant_id" value={p.id} />
            <Field label="Consent">
              <select name="consent_state" defaultValue={p.consent_state}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed by authorized adult</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </Field>
            <Field label="Recommendations received">
              <input
                name="recommendations_received"
                type="number"
                min={0}
                max={10}
                defaultValue={p.recommendations_received}
                required
              />
            </Field>
            <Field label="Recent attendance (%)">
              <input
                name="recent_attendance"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={p.recent_attendance ?? ""}
              />
            </Field>
            <Field label="Probation started">
              <input
                name="probation_started_on"
                type="date"
                defaultValue={p.probation_started_on ?? ""}
              />
            </Field>
            <label className="check-label">
              <input
                name="registration_confirmed"
                type="checkbox"
                defaultChecked={p.registration_confirmed}
              />
              Annual registration confirmed
            </label>
            <label className="check-label">
              <input
                name="prior_achievement_confirmed"
                type="checkbox"
                defaultChecked={p.prior_achievement_confirmed}
              />
              Prior achievement confirmed
            </label>
            <SaveButton>Save onboarding evidence</SaveButton>
          </form>
        </details>
      )}
      {isManager && (
        <details>
          <summary className="py-3 font-semibold cursor-pointer">
            Assign an adult mentor
          </summary>
          <form
            action={assignMentor.bind(null, clubId)}
            className="form-grid mt-4"
          >
            <Hidden name="participant_id" value={p.id} />
            <Field label="Mentor">
              <select name="mentor_profile_id" required>
                {adultOptions.map((id) => (
                  <option key={id} value={id}>
                    {names.get(id) ?? "Club adult"} ·{" "}
                    {
                      mentors.filter(
                        (m) =>
                          m.mentor_profile_id === id &&
                          m.assignment_type === "primary",
                      ).length
                    }{" "}
                    primary assignments
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assignment type">
              <select name="assignment_type">
                <option value="primary">Primary</option>
                <option value="operational">Operational</option>
              </select>
            </Field>
            <Field label="Operational department">
              <DepartmentSelect allowEmpty />
            </Field>
            <p className="text-sm text-muted-foreground">
              Recommended primary mentor load: no more than three teens. Saving
              checks club role and eligibility.
            </p>
            <SaveButton>Assign mentor</SaveButton>
          </form>
        </details>
      )}
      {isDirector && p.status === "pending" && (
        <form action={admitParticipant.bind(null, clubId)}>
          <Hidden name="participant_id" value={p.id} />
          <Button disabled={!checks.length || checks.some((c) => !c.complete)}>
            Admit participant
          </Button>
        </form>
      )}
      {isManager && assigned.length > 0 && (
        <details>
          <summary className="py-3 font-semibold cursor-pointer">
            Plan a rotation
          </summary>
          <form
            action={addRotation.bind(null, clubId)}
            className="form-grid mt-4"
          >
            <Hidden name="participant_id" value={p.id} />
            <Field label="Department">
              <DepartmentSelect />
            </Field>
            <Field label="Assigned mentor">
              <select name="mentor_assignment_id">
                {assigned.map((m) => (
                  <option key={m.id} value={m.id}>
                    {names.get(m.mentor_profile_id) ?? "Assigned adult"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Starts">
              <input name="starts_on" type="date" required />
            </Field>
            <Field label="Ends">
              <input name="ends_on" type="date" required />
            </Field>
            <SaveButton>Plan rotation</SaveButton>
          </form>
        </details>
      )}
    </article>
  );
}
