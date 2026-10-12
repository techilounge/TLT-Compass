# Staging migration evidence — 11 October 2026

User confirmed the dedicated Supabase project was empty and authorized migration. Inspection confirmed zero public tables and zero auth users. Updated credentials connected successfully; no credentials were printed.

Applied migrations 202610110001 through 202610110005, in order, in a single transaction. Recorded version, name and SQL statements in supabase_migrations.schema_migrations. Created Stonehill TLT Club with America/Chicago as its configurable shared program timezone. No synthetic seed was loaded.

Before commit, verified all 15 public tables have RLS enabled; every table returned zero records to authenticated without user claims; anon SELECT on clubs raised 42501. After commit, independently inspected the tables and verified anonymous PostgREST SELECT using the app's publishable key also raised 42501. Auth user count remained zero.

These checks verify schema application and basic unauthenticated boundaries. They do not establish full hosted tenant isolation, real MFA behavior, token refresh, concurrency or release readiness. Eligible director provisioning, auth configuration and a hosted operational walkthrough remain next. The initial migration runner deliberately refuses a database with existing public tables or migration history.

The user subsequently confirmed adult eligibility and authorized sending the staging director invitation, then corrected the recipient to tltcompass@stonehillchurch.org. The earlier address must not be invited. No local Auth admin credential is configured. The user signed in to the dashboard. Site URL is http://localhost:3000; the invitation must be opened on this machine with the app running. Custom email templates are unavailable without SMTP or a paid plan, so the app now supports default invite/recovery fragment links as well as custom token-hash links. Credentials are removed from the fragment before session establishment, sessions are verified through getUser, and redirects are fixed internal paths.

After fresh user confirmation, the corrected invitation was submitted successfully. Supabase recorded invited_at for the matching account. The dashboard subsequently showed confirmation and a sign-in; inbox delivery and password setup were not independently inspected. The provisioning transaction created human-confirmed club eligibility and an active director membership. Re-running the idempotent operator script verified that the account has no effective club roles with aal1 claims and has director access with aal2 claims. These are database policy checks using operator-set test claims, not proof of actual MFA enrollment. Real MFA enrollment and the hosted operational walkthrough remain pending. No invitation was sent to the earlier address.

`scripts/provision-director.mjs --apply` provisions only an existing invited account into exactly one named club, with explicit human eligibility confirmation, a transaction, and existing audit triggers. It never creates passwords or bypasses adult MFA. Contact and club inputs come from operator environment variables, not hardcoded authorization.

## Invitation landing failure

The user reported /login?notice=invalid after opening the invitation. Dashboard Auth logs showed a successful /invite (200), /verify (303), and Login at 11:43 on 11 October. This proves provider acceptance, not a completed app session. The original browser failure has not been reproduced or diagnosed conclusively. A new synthetic browser regression verifies that default invitation fragment handling creates a session cookie before navigating to password setup, with the provider response and protected destination mocked only in that test. Incomplete and expired link checks also pass. Error messages now distinguish expired, incomplete and session-establishment failures from incorrect password sign-in.

After the user explicitly authorized recovery, the replacement password-recovery email was sent to the accepted director account. Supabase displayed "Password recovery sent" and confirmed the corrected recipient; its UI reports a 60-minute validity. Password setup and actual MFA enrollment remain user steps. The earlier automatic approval rejection was resolved by the user's explicit authorization.

## Authenticator setup usability

The user confirmed password setup succeeded, then requested Google Authenticator support. The existing enrollment supported standard TOTP but exposed only a manual key. The app now displays the provider QR code as an image, Google Authenticator instructions, another-app option, manual time-based setup instructions and account label, and clock-sync guidance after verification errors. QR SVG data is URI-encoded where necessary. Verified factors are preserved; errors removing abandoned unverified factors stop new enrollment. Actual phone scanning and live code verification remain user steps; no authenticator secret or code was inspected by the agent.

# Phase 2 continuation — 11 October 2026

Continuation also applied 020 (explicit draft reference-catalog imports), 021 (private reviewed question bank) and 022 (supervised sessions/manual game results), after relevant integration checks passed. No curriculum, demo questions or scores were inserted by migration. Full local suite: 45 unit and 81 SQL cases; production build passed. The live AI runtime login was verified to lack direct participant and credential table SELECT privileges.

Further automatic continuation applied 014–016 (manual calendar, reviewed CSV imports, private PDF jobs), 017–018 (AI registry/budgets and encrypted credentials), and 019 (human-approved event proposals creating private drafts). No demo seeds were applied. AI remains off and no live inference was performed. The dedicated AI runtime login was provisioned with named function grants and no table access; generated runtime/encryption secrets remain in ignored local environment configuration. Platform ownership has not been assigned pending the user's answer.

Migrations 011 (PDF audit), 012 (recognition) and 013 (progress dashboards) applied after 48 SQL integration cases, 10 unit cases, seven browser boundaries and a production build passed. The runner reported no demo seeds. Feature scope and outstanding hosted/manual acceptance are documented in phase-2-engagement.md.

Follow-up migration 202610110010_attendance_lock_order.sql also applied successfully after all 38 SQL cases and the final production build passed. This aligns review/correction participant locks and scopes attendance-version foreign keys by club. The runner reported no demo seed applied.

Applied 202610110007_attendance.sql, 202610110008_training_hours.sql and 202610110009_export_audit.sql using the project-matched transactional migration runner. No demo seed was applied. Read-only inspection found 19 public tables, all with RLS enabled, and one Auth user. No hosted youth records were read or created for this inspection. Local synthetic SQL tests cover the new functions; authenticated hosted workflow acceptance remains pending.
