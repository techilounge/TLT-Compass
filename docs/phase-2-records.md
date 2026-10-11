# Phase 2 records slice — 11 October 2026

Later continuation supersedes the original missing-PDF/points/dashboard statements below: see phase-2-engagement.md for departmental Record Book, full export indexes, PDF, recognition and initial analytics implementation and verification. Remaining gaps are explicitly listed there.

Attendance/uniform, reviewed workshop/lab hours and scoped CSV exports are implemented. This is partial PR 6 coverage, not completion of Phase 2 or production readiness. PDF reports, fuller Record Book exports, level review, points and dashboards remain pending.

## Behavior

- Workspace and Admin Dashboard link to Attendance and Training hours. Attendance sessions belong to a season; required flags, excused absence treatment and uniform denominator are configurable per session. Only verified entries contribute to independent attendance/uniform ratios. Missing records and zero denominators are not silently counted as failures. Corrections reset review and preserve immutable entry versions.
- Workshop and lab minutes are separate. Positive intervals must fall within the season and not in the future; pending/verified intervals cannot overlap. Browser-local input is converted to UTC. Skipped daylight-saving times are rejected; repeated local times use the earlier occurrence. Request IDs prevent retry duplicates. Eligible assigned reviewers verify or reject; submitters cannot approve their own entries. Reviewed entries are immutable. A reversal/correction workflow for already verified hours remains pending.
- CSV exports use the signed-in user's RLS scope, include alias, reviewer timestamps, attendance session dates, rule versions and requirement citations, and audit generation. They omit raw reflections/evidence text and private reasons. Formula prefixes are neutralized; quotes/newlines/Unicode are preserved. Exports refuse records above the synchronous limit instead of truncating. The current export does not yet include the full task evidence index, rotations or a branded PDF.
- Attendance and hours screens use bounded selectors/lists (100 participants/seasons/sessions, 500 attendance entries, 200 hours). Summaries query all authorized entries. Larger-club pagination remains pending before multi-tenant rollout.

## Verification

Local unit tests: eight passing. SQL integration tests: 38 passing across six files, including two-club isolation, MFA, self-review, stale corrections, independent denominators, idempotency, overlaps, immutable reviews and export auditing. These use synthetic identities; they do not establish hosted user-session behavior. Typecheck/lint, formatting, secret scan and final production build passed. Three focused browser cases passed for unauthenticated attendance/hours/export redirects; the Windows runner required shutdown after the cases. Authenticated visual/accessibility and multi-user operational checks remain pending. Migrations 007–010 are applied to staging without demo seeds; 010 aligns correction/verification lock order and enforces club-scoped history references. Native PostgreSQL concurrency stress remains pending.

## Manual staging checks

Create an approved, source-confirmed rule version and a season; enroll synthetic consenting participants and assign eligible mentors. Create a past meeting, record present/absent/excused and uniform assessments, verify entries, then correct one and confirm totals exclude it until reverified. Submit workshop/lab intervals, reject an overlap, approve as another assigned adult, and compare totals. Export one authorized record and confirm provenance and audit; another club must have no access. Do not use real youth data for these checks.
