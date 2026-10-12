import type { RuleRecord } from "@/modules/program-rules/contracts";
import { Field, FormPanel, DepartmentSelect, SaveButton } from "./forms";
import {
  updateClub,
  createRule,
  addRequirement,
  approveRule,
  createSeason,
} from "@/app/workspace/[clubId]/actions";
export function ClubSetup({
  clubId,
  clubName,
  timezone,
  rules,
  isDirector,
  returnArea = "workspace",
}: {
  clubId: string;
  clubName: string;
  timezone: string;
  rules: RuleRecord[];
  isDirector: boolean;
  returnArea?: "workspace" | "admin";
}) {
  const drafts = rules.filter((r) => r.status === "draft");
  return (
    <section id="setup" className="space-y-4 scroll-mt-6">
      <h2 className="text-2xl font-bold">Program setup</h2>
      {isDirector && (
        <FormPanel title="Club settings">
          <form action={updateClub.bind(null, clubId)} className="form-grid">
            <input type="hidden" name="return_area" value={returnArea} />
            <Field label="Club name">
              <input
                name="name"
                maxLength={120}
                defaultValue={clubName}
                required
              />
            </Field>
            <Field label="IANA timezone">
              <input
                name="timezone"
                maxLength={100}
                defaultValue={timezone}
                required
              />
            </Field>
            <SaveButton>Save club settings</SaveButton>
          </form>
        </FormPanel>
      )}
      <p className="text-muted-foreground">
        Every season uses an explicit rule version. Local policy values below
        are editable draft starting points; confirm them before approval.
      </p>
      <FormPanel title="Create a rule version">
        <form action={createRule.bind(null, clubId)} className="form-grid">
          <input type="hidden" name="return_area" value={returnArea} />
          <Field label="Version label">
            <input
              name="version"
              maxLength={80}
              placeholder="Conference 2026 — revision 1"
              required
            />
          </Field>
          <Field label="Source title">
            <input name="source_title" maxLength={200} required />
          </Field>
          <Field label="Minimum grade">
            <input
              name="minimum_grade"
              type="number"
              min={1}
              max={12}
              defaultValue={9}
              required
            />
          </Field>
          <Field label="Maximum grade">
            <input
              name="maximum_grade"
              type="number"
              min={1}
              max={12}
              defaultValue={12}
              required
            />
          </Field>
          <Field label="Minimum recent attendance (%)">
            <input
              name="minimum_attendance"
              type="number"
              min={0}
              max={100}
              defaultValue={80}
              required
            />
          </Field>
          <Field label="Recommendations required">
            <input
              name="recommendation_count"
              type="number"
              min={0}
              max={10}
              defaultValue={3}
              required
            />
          </Field>
          <Field label="Probation days">
            <input
              name="probation_days"
              type="number"
              min={0}
              max={365}
              defaultValue={60}
              required
            />
          </Field>
          <label className="check-label">
            <input
              name="require_prior_achievement"
              type="checkbox"
              defaultChecked
            />
            Prior achievement required
          </label>
          <SaveButton>Create draft</SaveButton>
        </form>
      </FormPanel>
      {drafts.length > 0 && (
        <FormPanel title="Add a documented requirement">
          <form
            action={addRequirement.bind(null, clubId)}
            className="form-grid"
          >
            <input type="hidden" name="return_area" value={returnArea} />
            <Field label="Draft version">
              <select name="rule_set_id">
                {drafts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.version}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Level">
              <select name="level">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <DepartmentSelect />
            </Field>
            <Field label="Requirement type">
              <select name="requirement_type">
                <option value="required">Required</option>
                <option value="optional">Optional</option>
              </select>
            </Field>
            <Field label="Original short description">
              <textarea name="description" maxLength={2000} required />
            </Field>
            <Field label="Source page">
              <input name="source_page" maxLength={80} required />
            </Field>
            <Field label="Source section">
              <input name="source_section" maxLength={200} required />
            </Field>
            <SaveButton>Add requirement</SaveButton>
          </form>
        </FormPanel>
      )}
      {isDirector && drafts.length > 0 && (
        <FormPanel title="Approve a rule version">
          <form action={approveRule.bind(null, clubId)} className="space-y-5">
            <input type="hidden" name="return_area" value={returnArea} />
            <Field label="Draft version">
              <select name="rule_set_id">
                {drafts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.version}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Confirmed conference/source reference">
              <textarea name="source_reference" maxLength={2000} required />
            </Field>
            <label className="check-label">
              <input name="confirmed" type="checkbox" required />I reviewed the
              documented requirements and confirm this version is appropriate
              for our club.
            </label>
            <p className="text-sm text-muted-foreground">
              Approval freezes this version. Later changes require a new
              version.
            </p>
            <SaveButton>Approve version</SaveButton>
          </form>
        </FormPanel>
      )}
      {rules.length > 0 && (
        <FormPanel title="Create a club season">
          <form action={createSeason.bind(null, clubId)} className="form-grid">
            <input type="hidden" name="return_area" value={returnArea} />
            <Field label="Season name">
              <input name="name" maxLength={120} required />
            </Field>
            <Field label="Rule version">
              <select name="rule_set_id">
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.version} · {r.status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <input name="starts_on" type="date" required />
            </Field>
            <Field label="End date">
              <input name="ends_on" type="date" required />
            </Field>
            <Field label="Schedule">
              <select name="schedule_months">
                <option value="9">Nine months</option>
                <option value="12">Twelve months</option>
              </select>
            </Field>
            <SaveButton>Create season</SaveButton>
          </form>
        </FormPanel>
      )}
    </section>
  );
}
