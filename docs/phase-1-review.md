# First operational slice: hands-on review gate

Blueprint section 13, Phase 1 PR 5 requires: “Mandatory hands-on review: no phase expansion until signed off.” This gate is not satisfied by automated tests or the initial instruction to build toward production.

## Review now with synthetic practice

Run npm run dev and open /sandbox. Start in director view and assign the exercise. Switch to participant, submit invented evidence and reflection. Switch to mentor and request changes with feedback. Revise as participant, then verify as mentor. Check that both versions remain visible, the checklist records the reviewer, and reload/reset removes practice state. Confirm phone layout, keyboard navigation, labels and language.

Sandbox state is in memory only. Role switching is a demonstration, never authentication. It neither validates real conference rules nor signs official records.

## Review the connected flow in staging

Follow runbooks/supabase-setup.md. With distinct synthetic accounts, complete MFA, configure a source-confirmed rule version/season, create and admit a participant with an eligible mentor, assign a requirement task, submit evidence as the participant, request changes, resubmit, and verify as the assigned adult. Confirm the rule version, reviewer and date in the checklist. Test an unrelated staff account and a second club account; both must be denied unrelated records and reviews. Revoke membership/screening and verify access disappears.

Confirm invitations, token refresh and account recovery against real Supabase services. These are not validated by the local identity fixtures. Record the environment, reviewer, date, findings and explicit sign-off here before moving to Phase 2.

## Current sign-off

Pending. Hosted staging, current source verification, connected-account walkthrough and human review have not been completed. Phase 2–5 work has not started. No public/youth deployment has occurred.
