# TLT Program Manager
## Codex-ready Product Requirements, Architecture, and Implementation Plan
Version 1.0 | 10 October 2026 | Proposed working name: TLT Compass

> **Status:** Implementation blueprint, not deployed software. Source manuals should be verified against current conference requirements before compliance rules are enforced. The NAD Director's Guide (2014), Record Book (2016), and Ascent overview have different emphases. Store rule versions and allow authorized local configuration instead of silently overriding the manuals.

## 1. Executive vision
Build a mobile-first, installable, accessible web app that helps one Pathfinder club run Teen Leadership Training (TLT): participant onboarding, adult mentorship, four-year program progression, six departmental rotations, tasks and evidence, supervised approvals, attendance/uniform records, workshop/lab hours, calendar and events, points and leaderboards, games and reflections, reports, and a configurable multi-provider AI assistant. Prefer small recurring infrastructure bills and keep API keys server-side. Design the schema for multi-club tenancy even if launching for one club.

**Core differentiation:** a faithful digital TLT Record Book, not a generic youth task app. All official program completion is derived from documented requirements, authorized reviews, and evidence. Points make participation fun but never substitute for sign-off.

## 2. Source-of-truth and rule handling
### Uploaded references
1. *Teen Leadership Training Program Ascent* (12-page illustrated overview). Four leadership pillars (organization, relationships, expansion, spiritual growth); leadership compass of six departments; four-year ascent; special projects; mentor relationships.
2. *TLT Director's Guide*, NAD edition 2.0 (June 2014). Program purpose, member eligibility, application/recommendations, at least 60-day probation, two mentor classifications, level requirements, department task catalogs marked required vs optional, reporting, workshop and lab-credit option.
3. *TLT Record Book* (copyright 2016). Participant records, departmental workshop instruction/completion dates, lab hours, reviewer/mentor approvals, per-level checklists, Special Operations and graduation evidence.
4. *SabiQuiz_Template (1).csv*. Six columns: Question, Option A/B/C/D, Correct Answer letter. The companion `TLT_Leadership_SabiQuiz_Question_Bank.csv` supplies 226 practice questions using this structure.

### Principles of interpretation
- Membership described for grades 9–12, prior Investiture Achievement, and recent attendance of at least 80%; annual registration and three recommendations are described. Do not silently grant eligibility.
- Standard level attendance and proper-uniform targets of at least 80% are distinct measures.
- Core operational departments: Administrative, Outreach, Teaching, Activities, Records, Counseling. Additional Special Operations #1 and #2 are distinct.
- Adult mentoring is essential. The guide recommends a primary mentor for no more than three teens; adult protection eligibility rules must be reviewed against current conference safeguarding guidance.
- The Ascent progression emphasizes recommended Level 1 Administrative/Outreach; Level 2 Teaching/Activities; Level 3 Records/Special Operations #1; Level 4 Counseling/Special Operations #2. The Director's Guide also outlines alternative assignments, and some summary checklists describe rotations differently. Encode defaults as **recommended configurations**. Confirm final rules with the club/conference before declaring official completion.
- Training language uses assist, coordinate, develop as increasing responsibility.
- Certain checklists and operations tasks are formally required; others optional. Store `requirement_type`, source document/page and rule version.
- Academic-credit pathway, where locally approved, describes **six workshop hours and 72 lab hours per semester**, with local/conference variation. This is an **optional separate track**, not an automatic credit guarantee. Keep hours in explicit categories and prevent double counting.
- The manuals contain copyrighted program text. Do not publicly redistribute wholesale. Use short, original task descriptions plus citations/page references, and keep any full source documents in protected administrative storage unless permission exists.

## 3. Users, roles, and permissions
- **Platform Owner / Super Admin:** tenant configuration, AI providers, audit logs, privacy and export, emergency disable, backups.
- **Club Director:** manages club program, admits TLTs, assigns primary and operational mentors, approves level completions, finalizes official records.
- **TLT Program Coordinator:** operates schedules, tasks, scoring rubric and review queues within delegated authority.
- **Primary Mentor:** views assigned TLTs; assigns work; reviews evidence, progress and reflections; awards approved points; initiates concerns to director.
- **Operational Mentor / Staff:** manages assigned department and rotation, verifies departmental tasks and lab hours, cannot approve unrelated users.
- **TLT Participant:** sees own goals/calendar/tasks/points/feedback; submits work and reflections; participates in games; no access to other teens' sensitive data.
- **Parent/Guardian (optional, explicit authorization):** own child's limited progress and calendar, not private mentoring notes, safety cases, or peers' personal data.
- **Read-only Viewer (optional):** public/private leaderboard only using aliases and tightly scoped access.

Enforce authorization server-side and in database RLS. No front-end-only roles. Handle dual roles and tenant-scoped assignments; club membership is separate from authentication identity.

## 4. Detailed product modules
### 4.1 Setup and onboarding
Club profile, timezone, Pathfinder year, term dates, nine- or twelve-month operating schedule, conference policy version, branding. Invite adult staff, record screening/eligibility status without storing unnecessary screening details. Create TLT profile with minimal data, grade/level, consent status, mentor assignment, enrollment status and probation dates. Register application/recommendation existence and approval timestamps; store documents privately if essential. Show missing prerequisites, never auto-accept by AI.

### 4.2 Participant dashboard / digital record book
Prominent current level, next milestone, assigned department, mentor, required tasks incomplete, due dates, attendance %, uniform %, workshop/lab hours, achievements, points and pending reviews. Download a human-readable PDF progress record. Each checklist entry stores source reference, completion date, evidence and signed reviewer, preserving historical rule version. No conflation of operational hours and game points.

### 4.3 Rotation and curriculum engine
Seed six departmental catalogs and Special Operations categories. Create program level, session/semester, rotation assignment and primary/operational mentor relationships. Recommended but overrideable yearly plans; overlapping assignments trigger warning. Tasks have required/optional status, department, instructions, due date, prerequisites, safety risk, staff owner, allowable evidence, points cap and approval policy. Advanced progression Level 3/4 must retain special project and beyond-club service evidence. Review each rotation before next assignment; require explicit director authorization for level promotion.

### 4.4 Tasks and approval workflow
States: draft -> assigned -> in_progress -> submitted -> changes_requested -> verified -> closed, plus cancelled. Submissions allow structured text, attachments, reflection and activity dates. Mentor may approve/reject with feedback; role-appropriate director signs formal milestones. Version submissions; append-only audit record; notify participant; no self-approval. Bulk assign but never bulk-approve safety or completion requirements. Optional rubric: planning 0–5, teamwork 0–5, communication 0–5, service 0–5, reflection 0–5; configurable and distinct from official completion.

### 4.5 Points, badges, and leaderboards
Default sample rubric (editable): attending an activity +5; on-time task submission +5; approved task +10; leading a supervised activity +15; helping a fellow Pathfinder +10; reflection +5; service milestone +20; quiz/game result 0–15. Caps per event/activity and anti-gaming checks. These are **proposed local gamification rules**, not official NAD regulations.

Maintain an **append-only points ledger** with source event, award rule, points delta, actor, reason, idempotency token and reversal reference. Never update totals directly. Recalculable rankings for monthly, semester, yearly, all-time and by level; optional team and 'most improved' displays. Avoid public ranked displays for minors by default; opt-in alias or first name with consent, hide scores when confidentiality demands. Recognize noncompetitive awards: collaboration, service, improvement, dependability, courage. Configure max quiz contribution to prevent knowledge games eclipsing service. Negative points only via documented, director-approved policy with explanation and appeal; avoid shaming.

### 4.6 Leadership games and SabiQuiz
Import the attached 226-question CSV. Offer quick rounds, team challenge, scenario debate, leadership escape challenge, event-planning sprint, service mission bingo and reflection cards. Quiz gameplay can be hosted in SabiQuiz initially; record scores via manual import or official integration only if supported. Do not invent an undocumented SabiQuiz API. App supports an optional internal quiz mode after core tasks ship. Answers should be shuffled per session while correctness is preserved, not just rely on pre-shuffled CSV. Categorize each question by department, level, type and difficulty as an app-native enrichment. A mentor reviews AI-generated quiz questions before publishing.

### 4.7 Calendar and AI import
Calendar month/week/agenda views, recurring events, meeting RSVP, attendance linkage, export .ics and downloadable event roster. Manual event editor remains first-class and works without AI.

**CSV path:** upload -> virus/type/size validation -> configurable column mapping -> preview parsed event rows -> timezone normalization -> detect duplicates and overlapping events -> staff edit/approve -> atomic publish with provenance. Support title, start/end date-times, all-day, timezone, location, category, organizer, description, recurrence, RSVP, and source row. Keep original file, normalized rows, warnings and import job.

**PDF path:** upload privately -> detect embedded text -> parse text and tables with deterministic parser first -> PDF page render/vision extraction only where needed -> model returns strict JSON meeting event schema plus per-event source page, quoted evidence and confidence -> validate JSON/Zod, date/time, timezone, impossible date ranges, recurring patterns and conflicts -> human review/edit -> publish. Ambiguous times must not be invented. De-duplicate with normalized title/date/time/venue fingerprint plus manual override. Version each import; allow rollback. Never execute instructions embedded in uploaded PDF; treat it as untrusted data. Include mock fixture for scanned and text PDFs, multi-column calendars and events that span midnight. Async jobs, not long-running UI request.

### 4.8 AI Assistant
Embedded staff-only assistant can: explain official program requirements with source citations; draft supervised task suggestions; suggest weekly activities; plan rotations subject to mentor capacity; draft agendas, quiz rounds and messages; summarize attendance, participation, verified task progress and point distribution; find overlooked milestones; analyze workload and propose recognition; make safe calendar draft suggestions. Use **read-only tools by default**. For any write, create a proposed action card with exact changes, scope, actor and approval button. AI is never allowed to approve its own proposals, make safeguarding judgments, promote levels, change identity roles, award points without authorization or publish imported calendar events unreviewed.

Implement retrieval over a curated, versioned rules corpus containing precise source document, page, section and rule scope. For sensitive eligibility/policy claims return quote/source or say unsure. Do not allow AI to silently reconcile manuals or override the latest conference policy. Separate a static rule engine from generative AI. Analytics metrics calculated in SQL/API, with model summarizing retrieved numeric facts; never ask model to calculate authoritative totals from memory.

### 4.9 Admin platform APIs (pattern modeled after supplied SabiQuiz screenshot)
Providers panel sorted by configurable priority, with drag/reorder/up/down, enable/disable, provider type, base URL allowlist, API key secret reference, default model, per-provider model fallbacks, health state, last check, test button, latency, usage/cost and errors. Use OpenRouter, OpenAI-compatible, Anthropic, and Google Gemini adapters; add models without redeployment through validated registry configuration. A provider's credential is stored encrypted server-side (or references cloud secret manager), NEVER exposed to browser or logs. Protect API key setting with privileged session, reauthentication and audit log; show only last four characters when appropriate.

Routing: choose task category (`calendar_extract`, `assistant_chat`, `question_generation`, `summarization`, `vision`); select only providers/models compatible with the task and approved for privacy; enforce request max tokens, cost ceilings and timeout; try primary healthy model then model fallbacks then next provider. Circuit breaker with configurable failures and cool-down; 401/403 = configuration fault, disable that specific route until fixed rather than endlessly retry; 429 = backoff/failover; 5xx/timeout = bounded retry and failover; validation/content safety failures = nonretryable unless explicitly configured. Check output against task-specific Zod schema before use; log attempt/latency/provider/model/token/cost and correlation ID but not raw youth data. Cost table must use configurable per-model pricing with version/timestamp; allow unknown price.

Health checks distinguish credentials, capability, quota, permissions and degraded service; an HTTP 200 from model-list endpoint is not sufficient proof of inference. Support 'Test' using safe synthetic payloads and redacted error messages. Show configuration check timestamps to prevent stale 'healthy' status. Enforce spend budgets per tenant/month and per role, and provide emergency AI-off switch; all core administrative workflows remain functional without AI.

The screenshot's Gemini 403 `PERMISSION_DENIED` is a useful test fixture for a down provider: UI must report permission failure, not silently treat it as a transient network issue.

### 4.10 Analytics and exports
Metrics: enrolled by level, mentor caseload, assignment backlog, on-time completion, verification time, official requirements % by level/department, attendance and uniform thresholds, workshop/lab hours, participation trends, service event counts, points distribution and award diversity, calendar conflicts, AI cost per workflow. Filter by term, mentor, level and department; small-group analytics should avoid identifiable sensitive comparisons. Export CSV and branded PDF record/report; include rule version, reviewer timestamps and evidence index. Backups and restore drill.

### 4.11 Notifications
In-app first; optional email via Resend later for guardian-approved account notifications, assignment due dates, approval requests, calendar revisions and positive achievements. Respect communication policy for minors, quiet hours, limited detail in messages, opt-outs where permitted, and no direct AI-to-minor messaging without approval.

## 5. Screen-by-screen UX / navigation
**Desktop navigation:** Overview | TLTs | Tasks | Rotations | Record Book | Calendar | Games | Leaderboard | Reports | AI Assistant | Settings.
**Mobile:** bottom navigation for Home, Tasks, Calendar, Scores, More; sticky actions and full-width tap targets.

1. Sign in / invite acceptance: accessible sign-in, password reset, role-aware redirects.
2. Club onboarding wizard: season, adult users, term configuration, conference policy review.
3. Mentor home: today's events, overdue approvals, TLTs needing check-ins, deadlines, AI suggestion card.
4. TLT home: milestones, personal tasks, calendar, personal points and badges, safe motivational progress.
5. Roster: searchable list; filters by level, mentor, probation and attendance.
6. TLT profile: six tabs Overview, Rotations, Tasks, Record Book, Points, Notes; access-aware.
7. Task list/board: status and deadline filters; bulk assignment; clearly labeled required tasks.
8. Task details: instructions, evidence, rubric, mentor feedback, review timeline.
9. Rotation planner: cards by level/department, mentor capacity, clash alerts.
10. Digital Record Book: official item checklist, date initials, lab/workshop hours and signature capture.
11. Calendar: month/week/agenda, event editor, conflicts, imported source info.
12. Import calendar wizard: upload, field-map/extract, editable preview, warnings, approve/publish, rollback.
13. Games: select question groups, host/team session, round results, voluntary score submission.
14. Leaderboard: opt-in public aliases; term selector; emphasis on recognition not only rank.
15. Analytics: structured metrics first; AI summary optional; drill-down with role limitations.
16. AI chat: source-linked guidance, data-scope indicator, proposal cards, review/confirm actions.
17. AI providers admin: matching supplied SabiQuiz UX pattern, includes provider list/failover, usage & cost, model support.
18. Program settings: point awards, level policies, consent, local rule overrides, imports, backups, log and accessibility.

**Design:** dark/light modes; palette inspired by TLT red/black with generous neutral surfaces, not saturated full-page red; clear typography; no horizontal scrolling at phone widths 320px+, keyboard navigation, WCAG AA contrast, 44px touch targets, loading/empty/error/success states, offline read-only personal tasks and calendar only if stored securely. Avoid any public PII.

## 6. Preferred bootstrap architecture
- **Frontend:** Next.js App Router + React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + React Hook Form/Zod.
- **Backend:** Next.js server routes/server actions with explicit service layer and transactional boundaries; Node runtime for PDF parsing and jobs. Keep AI adapter and rule engine independent of UI and Next.js-specific logic.
- **Database/Auth/Storage:** Supabase Postgres, Supabase Auth, RLS, private Storage buckets. Use Postgres views/functions for authoritative totals and approvals. Supabase Edge Functions or durable job worker for async tasks; scheduled event processing via platform cron and database-backed queue. Budget carefully and avoid upgrading until resource load justifies it.
- **Deployment:** Vercel frontend/API; Supabase DB/auth/private storage; optional Resend for email; Sentry or equivalent privacy-aware observability; GitHub Actions CI; staging/prod separation.
- **AI:** server-side task router with configurable provider/model registry. No hardcoded provider dependency in the domain logic.
- **Parsing:** CSV with robust stream parser and bounded rows; PDF with embedded text extraction first, page image for scans only; malware/type checks, max upload limit, bounded page count, safe job lifecycle.
- **Document export:** server-side PDF generation and CSV exports with proper redaction and access control.
- **Tenancy:** all club-scoped tables have `club_id` and season-specific tables `season_id`. Future SaaS-ready but launch single-club; no billing module for MVP.

### Example domain boundaries
`modules/auth`, `clubs`, `program-rules`, `participants`, `mentors`, `rotations`, `tasks`, `approvals`, `attendance`, `hours`, `points`, `leaderboards`, `events`, `calendar-imports`, `games`, `analytics`, `ai-router`, `ai-assistant`, `audit`, `notifications`.

## 7. Database design (minimum entities)
- `clubs(id, name, timezone, settings_json, created_at)`
- `seasons(id, club_id, name, starts_at, ends_at, status, schedule_months, rule_set_id)`
- `profiles(id, auth_user_id, display_name, status, created_at)`
- `club_memberships(id, club_id, profile_id, role, status, invited_by)`; multiple roles via separate rows or `membership_roles`
- `tlt_participants(id, club_id, profile_id_nullable, public_alias, grade_level, current_level, consent_state, probation_started_on, probation_completed_on, status)`; sensitive contacts in separate restricted table
- `mentor_assignments(id, club_id, tlt_id, mentor_profile_id, assignment_type, department_id, starts_on, ends_on)`
- `program_rule_sets(id, club_id_nullable, version, source_title, effective_on, status, approved_by)`
- `program_requirements(id, rule_set_id, level, department_id_nullable, category, requirement_type, description, source_page, source_section, sequence, dependency_json)`
- `participant_requirements(id, tlt_id, season_id, requirement_id, status, completed_at, reviewed_by, reviewed_at, notes)`
- `departments(id, code, name)` and `rotations(id, club_id, season_id, tlt_id, department_id, mentor_id, start_on, end_on, status, evaluated_at, reviewed_by)`
- `tasks(id, club_id, season_id, rotation_id_nullable, title, description, requirement_id_nullable, due_at, points_rule_id_nullable, status, created_by, assigned_to)`
- `task_submissions(id, task_id, tlt_id, version_no, submitted_at, reflection, status)` and `task_evidence(id, submission_id, private_storage_key, mime, size_bytes)`
- `task_reviews(id, submission_id, reviewer_id, decision, rubric_json, feedback, reviewed_at)`
- `attendance_sessions(id, club_id, season_id, event_id, held_at, attendance_required, uniform_required)` and `attendance_entries(id, session_id, tlt_id, attended, excused, uniform_compliant, recorded_by, review_status)`
- `training_hours(id, club_id, season_id, tlt_id, rotation_id, category [workshop|lab], start_at, end_at, duration_minutes, evidence_id, approved_by, approval_at)`; overlap detection.
- `level_reviews(id, club_id, tlt_id, rule_set_id, target_level, state, reviewer_id, reviewed_at, evidence_summary_json)`
- `point_rules(id, club_id, code, amount, caps_json, active)` and `points_ledger(id, club_id, tlt_id, season_id, source_type, source_id, rule_id, delta, awarded_by, reason, idempotency_key UNIQUE, reversed_entry_id, created_at)`
- `badges(id, club_id, code, title, criteria_json)` and `earned_badges(id, tlt_id, badge_id, awarded_by, earned_at)`
- `calendar_events(id, club_id, season_id, title, start_at, end_at, timezone, location, all_day, recurrence_rule, description, state, source_import_id_nullable, created_by)`
- `calendar_imports(id, club_id, uploaded_by, file_path, source_hash, status, parser_version, proposed_events_json, validation_json, approved_by, published_at)` and `calendar_import_rows(id, import_id, source_page_or_row, extracted_json, edited_json, warnings_json, confidence, status)`
- `quiz_sessions(id, club_id, season_id, started_by, mode, status)` and `quiz_scores(id, session_id, tlt_id, score, source, verified_by)`
- `ai_providers(id, club_id_nullable, name, provider_type, base_url, enabled, priority, credential_secret_ref, created_by)`
- `ai_models(id, provider_id, model_id, capabilities_json, context_limit, price_in_per_million_nullable, price_out_per_million_nullable, enabled)`
- `ai_routes(id, club_id_nullable, purpose, priority, provider_id, model_id, config_json)`
- `ai_attempts(id, club_id, purpose, provider_id, model_id, status, error_code, latency_ms, input_tokens, output_tokens, estimated_cost_usd, trace_id, created_at)`
- `ai_proposals(id, club_id, created_by, action_type, payload_json, state, approved_by, executed_at)`
- `audit_logs(id, club_id, actor_profile_id, action, resource_type, resource_id, before_json_redacted, after_json_redacted, occurred_at)`
- `consents`, `notifications`, `notification_preferences`, `exports`, `retention_jobs`, `safety_escalations` (restricted separately).

**Constraints/indexes:** every FKey scoped or validated to club; indexes `(club_id,season_id,status)` etc; unique enrollment per season, unique hours idempotency, unique point ledger idempotency; check positive durations, proper event intervals; prevent user setting their own `verified_by`; prevent cross-club joins in DB functions. RLS policies on all user-visible tables; server service role only in trusted execution with explicit membership checks. Avoid client access to raw AI credentials. Make policy tests mandatory.

## 8. Proposed API boundaries
`GET /api/me`, `GET/POST /api/clubs/:id/seasons`, `GET/POST /api/tlts`, `GET/PATCH /api/tlts/:id`, `POST /api/tlts/:id/mentor-assignments`, `GET/POST /api/rotations`, `POST /api/rotations/:id/review`, `GET/POST /api/tasks`, `POST /api/tasks/:id/submit`, `POST /api/submissions/:id/review`, `POST /api/levels/:tltId/request-review`, `POST /api/levels/:reviewId/approve`, `GET/POST /api/attendance`, `GET/POST /api/training-hours`, `POST /api/points/award`, `POST /api/points/:id/reverse`, `GET /api/leaderboard?seasonId=&period=`, `GET/POST /api/events`, `POST /api/calendar-imports`, `GET /api/calendar-imports/:id`, `PATCH /api/calendar-imports/:id/rows/:rowId`, `POST /api/calendar-imports/:id/publish`, `POST /api/calendar-imports/:id/rollback`, `GET /api/analytics/overview`, `POST /api/ai/chat`, `POST /api/ai/proposals/:id/approve`, `GET/POST/PATCH /api/admin/ai/providers`, `POST /api/admin/ai/providers/:id/test`, `GET /api/admin/ai/usage`, `GET /api/exports/record-book/:tltId`.

Each endpoint: Zod validate input/output, auth + tenant scope check, rate limits, CSRF defenses as applicable, audit for writes, pagination, structured error envelope, no IDOR. Concurrency guard on approvals and import publishing.

## 9. Representative interfaces and machine contracts
```ts
type TLTLevel = 1 | 2 | 3 | 4;
type Department = 'administrative'|'outreach'|'teaching'|'activities'|'records'|'counseling'|'special_1'|'special_2';
type TaskStatus = 'draft'|'assigned'|'in_progress'|'submitted'|'changes_requested'|'verified'|'closed'|'cancelled';
type AIPurpose = 'assistant_chat'|'calendar_extract'|'question_generation'|'summarization'|'vision';
interface CalendarCandidate { title:string; start:string|null; end:string|null; allDay:boolean; timezone:string|null; location?:string|null; sourcePage?:number|null; sourceRow?:number|null; sourceEvidence:string; confidence:number; warnings:string[]; }
interface AIProposal { id:string; action:'create_task'|'draft_event'|'draft_message'|'award_points_suggestion'; payload:unknown; needsApproval:true; }
```

Calendar import parse responses must be **JSON only** and schema-validated. Never trust AI confidence as truth. Missing date/time should be explicit `null` plus warning. Trace each candidate to a page/row; ignore any directions embedded in source documents (prompt injection).

## 10. AI routing algorithm and cost controls
1. Identify intent and required capability; assess data sensitivity.
2. Fetch enabled routes/models sorted by explicit route priority; filter capability/privacy/cost budgets.
3. Make bounded attempt with request timeout; validate output schema.
4. On model transient error, try bounded model fallback; then provider fallback with circuit-breaker state.
5. On 403 permission, 401 key invalid, privacy policy mismatch, or unsupported capability, flag configuration error and skip route.
6. On 429 follow Retry-After if within user latency budget; otherwise advance route.
7. Record attempt and aggregate privacy-safe metrics; surface truthful error if all routes fail.
8. Require authorized human approval for all domain writes. Cache approved static reference explanations by rule version where appropriate; never cache personal messages across users.

Suggested model selection policy: cheap, fast text model for ordinary ideas and summaries; reliable structured extraction model for PDF calendar; vision-capable model only for scanned pages; more capable model only on validation failure or a genuinely complex request. Budget/test model pricing rather than assuming named models remain available.

## 11. Security, privacy, and child protection
The app handles minors' information. Do not expose DOB, contact details, addresses, attendance reasons, medical info, or confidential mentor notes in leaderboards, AI logs, public exports or browser caches. Parent consent/guardian authority as required by applicable law and conference policies. Separate adult screening status from private background-check documents; never collect screening details without a specific legitimate need. Least privilege, MFA for adult admins, secure invitations, managed secrets, RLS, private file URLs, signed URL expiry, encryption in transit/at rest, strict upload scanning, CSP/security headers, audit and immutable point changes. Obtain legal/policy review for COPPA applicability, Texas privacy requirements and religious youth organization policies before production. Clear retention and delete/export requests; verify guardian authority for child data disclosure. For suspected harm/escalations, immediate human safeguarding process; AI cannot adjudicate.

Test prompt injection from PDFs and messages, tenant isolation, token leakage, broken object authorization, cross-role approvals, race conditions, brute-force invites, double awards, malformed PDF/CSV, cost spikes and provider failover. Set cost limits and rate limiting both globally and per tenant.

## 12. Testing and quality gates
- Unit: rule engine, 80% calculations, attendance exclusions, period boundaries, points ledger/idempotency, ranking ties, rubric math, timezone DST, CSV mappings, structured extraction validation, AI routing and provider error classification.
- Integration: RLS across two synthetic clubs; join and revocation; submission/review/promotion; imported calendar publishing in transaction; secret storage and AI health checks.
- End-to-end (Playwright): admin onboarding, invite TLT, assign mentor, publish task, submit evidence, approve, award and reverse points, leaderboard updates, mark attendance, review digital record, calendar CSV import, PDF review, AI proposal approval, provider failover.
- Accessibility: axe and keyboard-only navigation, contrast, mobile layout 320/375/768/1440, screen-reader labels, reduced motion.
- Performance: record 10k task records and 500 events, 10+ concurrent users per club; no N+1 on dashboards; target useful mobile performance on moderate connection.
- CI gates: lint, TS strict, tests, migrations and policy tests, preview build, secret scan, dependency audit, Playwright smoke; no deploy on failure.
- Release readiness: disaster restore tested, retention/safeguarding signoff, real calendar samples reviewed, one season's mock program data validated, pricing/cost alerts working.

## 13. Phased implementation for Codex
**Rule:** Every PR includes code, tests, accessibility where relevant, docs, migration and acceptance evidence. Avoid giant PRs; stop for human review after first end-to-end operational slice and before public/youth-facing deployment.

### Phase 0 – Bootstrap / repository foundation (PR 1–2)
PR 1: initialize Next.js/TS/Tailwind/shadcn, ESLint/Prettier, Zod, Vitest, Playwright, GitHub Actions, `.env.example`, README, ADRs, `AGENTS.md`, basic design tokens; establish staging branch and environments.
PR 2: Supabase migrations, auth & memberships, adult role permissions, RLS tests with two clubs, seeded sandbox demo and audit log. **Gate:** cross-club data isolation proven.

### Phase 1 – First useful Record Book slice (PR 3–5)
PR 3: club/year configuration, TLT roster/profile, mentor assignments and required onboarding checks; preserve minimum data.
PR 4: seed documented levels/departments/requirements with source references; configurable rule versions; rotation assignments.
PR 5: task creation/submission/mentor review and verified official checklist item; first real flow from director assignment to teen evidence to adult signoff. **Mandatory hands-on review:** no phase expansion until signed off.

### Phase 2 – Engagement and reporting (PR 6–8)
PR 6: attendance/uniform tracking, six department Record Book, workshop/lab hours, review workflow and PDF/CSV export.
PR 7: points immutable ledger, configurable rubrics, approved badges, private leaderboard and positive recognition; audit/reversal tests.
PR 8: responsive dashboards and mentor analytics; reminders and rules/configuration settings.

### Phase 3 – Calendar (PR 9–11)
PR 9: calendar manual CRUD, filtering, timezone/recurrence and attendance linkage.
PR 10: CSV parser/import preview, duplicate/conflict detection, publish/rollback.
PR 11: PDF extraction async jobs, model JSON schema, provenance, low-confidence warnings, editable review before publish; scanned PDF fallback only when necessary. **Gate:** 10 varied PDF/CSV fixtures, no silent invention of dates.

### Phase 4 – AI provider control plane (PR 12–14)
PR 12: secrets and provider registry, provider/model capabilities, admin UI matching screenshot's priority/fallback and Test/Key/edit/on-off controls.
PR 13: bounded routing, typed adapters, fallback/circuit breakers, permission errors, usage/cost dashboard and alarms; test with primary 403, timeouts and invalid JSON.
PR 14: rules retrieval with source references, read-only analytics assistant, safe task/event proposal cards with human approval and audit trail. **Gate:** documented zero-autonomous-write guarantee.

### Phase 5 – Games and polish (PR 15–17)
PR 15: import 226-question SabiQuiz CSV with correctness validation, app-native categories and hosted game rounds or manual score recording; avoid assumed SabiQuiz integration.
PR 16: team challenges, service badges, accessibility/visual polish, optional email notifications.
PR 17: production hardening, security/privacy review, retention, backup restore, documentation, performance/load tests, deployment and rollback SOP. **Gate:** club director reviews real workflows before inviting minors.

### Phase 6 – Future enhancements (not launch blockers)
Parent/guardian portal; multi-club SaaS self-service; secure approved SabiQuiz API integration if available; AI evaluation scorecards and routing experimentation; PWA offline task draft sync; calendar sync with Google/Microsoft after explicit opt-in; expanded program curriculum, conference reports, optional academic-credit exports, multi-language UX.

## 14. Repository structure
```
app/
  (auth)/  (dashboard)/  api/
components/
  layout/ tasks/ record-book/ calendar/ ai/ leaderboard/ games/
modules/
  auth/ clubs/ participants/ mentors/ program-rules/ rotations/
  tasks/ approvals/ attendance/ hours/ points/ calendar/
  calendar-imports/ games/ analytics/ ai-router/ assistant/ audit/
lib/
  db/ auth/ validation/ storage/ pdf/ csv/ security/ observability/
supabase/
  migrations/ seed.sql/ tests/rls/
workers/
  calendar-import/
tests/
  unit/ integration/ e2e/ fixtures/calendar/
docs/
  prd.md architecture.md threat-model.md decisions/ runbooks/
AGENTS.md
.env.example
```

## 15. Launch metrics, budgets and success criteria
- 100% of participants have an assigned authorized adult primary mentor.
- Official requirement completions always have reviewer and date; no completion from point scoring.
- Calendar imports never publish without adult confirmation.
- Every score change has a ledger event; totals reproducible.
- A failing primary AI provider does not break core functionality or reveal secrets.
- At least 95% of pilot sample attendance, required task and hour records match a manually reviewed paper Record Book.
- Pilot with 1 director, 2 adult mentors and 3–6 TLTs using synthetic data first.
- Bootstrap costs: start within generous free/low-cost hosting and DB tiers if allowed; choose a monthly AI spending ceiling before launch; all cost estimates subject to measured usage and current vendor pricing.

## 16. Decisions requiring local confirmation
1. Final current conference rule version; especially Level 3/4 rotations and progression.
2. Club season dates, nine-month or twelve-month cadence and point rubric.
3. Guardian access and consent policy, youth login eligibility and communication policy.
4. How/if current SabiQuiz supports score import or secure API integration.
5. Whether the app starts as internal single-club use or will need self-service multi-club accounts at launch.
6. Branding/name (`TLT Compass` is a working title), organization logo license and domain.

## 17. Master prompt for Codex
Copy this prompt into Codex after connecting a clean repository and adding the documents as authorized local references:

> You are the lead engineer for **TLT Compass**, a mobile-first Pathfinder Teen Leadership Training program manager. Implement the attached `TLT_Program_App_Codex_Implementation_Blueprint.md` faithfully using Next.js App Router, TypeScript, Supabase Postgres/Auth/RLS/Storage, Tailwind/shadcn, and strong automated testing. Treat the uploaded TLT Director's Guide, Record Book and Ascent overview as reference material; document source page and version for every formal curriculum rule. Never substitute AI answers for official completion, never allow minors' data across club boundaries, never expose API keys or confidential records, and never autonomously approve tasks or calendar imports. Implement in the exact PR phases in section 13, one reviewable PR at a time. First inspect the existing repository and report what exists, gaps, decisions, and planned PR breakdown. Do not overwrite working features. Start with Phase 0 and stop for review at the Phase 1 PR 5 gate and every later designated gate. Every PR must provide code changes, migrations, tests, screenshots for new UI, accessibility checks, risks, and manual validation steps. Keep costs low without compromising security, correctness or design quality. If a policy is ambiguous, model it as a clearly labeled configurable rule requiring human confirmation; do not make up a definitive official rule. For AI, implement provider priorities, configurable per-provider model fallbacks, purpose-specific routing, encrypted secret refs, 401/403/429/5xx handling, usage and cost, and proposals requiring staff approval. For PDF calendar extraction, use strict schema outputs, source page evidence, validation, duplicate/conflict warnings and human preview/publish. Import the included SabiQuiz CSV using its exact columns. Begin by writing `docs/implementation-status.md`, `docs/decisions.md`, and `AGENTS.md`, then implement PR 1 and present evidence before continuing.

## 18. Source traceability reference
- Ascent overview pp. 3–8: shared service, four pillars, four-year levels, six-department compass, rotation focus and mentor structure; pp. 10–11: special operations and academic credit illustrated.
- NAD Director's Guide pp. 5–7: purpose/goals, membership, six departments; pp. 9–12: probation, mentor, eligibility, per-level duties; pp. 15–16: academic credit and operational expectations; pp. 19–22: required/optional task details; pp. 25–40: forms and review checklists.
- TLT Record Book pp. 1–5 and record pages: individualized profile, level checklists, departmental training and hours fields, initial/review signoffs.

