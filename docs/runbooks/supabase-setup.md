# Supabase staging setup

The user-provisioned staging project received migrations 202610110001 through 202610110005 on 11 October 2026. Stonehill TLT Club was created with configurable America/Chicago program timezone. All 15 public tables have RLS; anonymous PostgreSQL and PostgREST reads were denied, and an authenticated role without a user identity saw no records. No demo seed was loaded. With explicit user confirmation of eligibility and invitation authorization, the corrected director account was invited and provisioned. Database checks denied director access at aal1 and allowed it at aal2; actual MFA enrollment and hosted role-based workflow verification remain pending. Do not paste secrets into chat or commit them.

`scripts/inspect-staging.mjs` reads schema metadata and auth user count without printing credentials. `scripts/migrate-staging.mjs --apply` is an initial-only transactional runner: it refuses an existing public schema or migration history, verifies the configured project matches the database, applies ordered SQL with Supabase migration history, and checks RLS before committing. It requires ignored SUPABASE_DB_URL plus operator-supplied TLT_INITIAL_CLUB_NAME and TLT_INITIAL_CLUB_TIMEZONE environment variables. Subsequent migrations should use Supabase CLI migration tooling after history inspection; do not rerun the initial runner against this project.

1. Create a dedicated staging Supabase project and a separate production project. Disable public signup, configure the exact application URL and redirect allowlist, enable TOTP MFA, apply Supabase's recommended auth rate limits and email verification. Do not reuse an unrelated database.
2. Apply every migration in supabase/migrations in timestamp order through reviewed Supabase migration tooling. The local config is provided for `supabase start` / `supabase db reset` on a machine with Docker and Supabase CLI. Neither is installed in this workspace.
3. Use the staging HTTPS URL and publishable key in ignored .env.local. Normal app code does not need a secret/service key. Restart npm run dev after configuration. Only loopback HTTP URLs are accepted in development; production requires HTTPS.
4. Create/invite an adult operator account using trusted Supabase administration, after authorization to send the invitation. The auth trigger creates a profile with a neutral display name. Existing auth accounts need an explicit matching profiles row if they predate migrations.
5. In one reviewed operator transaction, create a club, record the adult's club-specific eligibility after human verification, and create its first director membership. Only record eligible/reviewed_at; do not import background-check documents. The example below deliberately contains placeholders and is not executable without replacement.

```sql
begin;
insert into public.clubs(id,name,timezone) values ('<club-uuid>','<club-name>','America/Chicago');
insert into public.staff_eligibility(club_id,profile_id,eligible,reviewed_at)
values ('<club-uuid>','<adult-auth-uuid>',true,now());
insert into public.club_memberships(club_id,profile_id,role)
values ('<club-uuid>','<adult-auth-uuid>','director');
commit;
```

6. Where custom templates are available, configure invite/recovery email links as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (or type=recovery). The home page also supports Supabase default invite/recovery fragment links, removes tokens from the address before processing, verifies the session, and opens password setup. Set Site URL to the exact app origin; localhost links must be opened on the machine running the app. Invitations and account recovery are operator-managed in this slice; there is no self-service email sending screen.
7. The adult opens the invitation, sets a password, and sets up/verifies an authenticator at /account/security. Set a meaningful display name there. The workspace becomes available only with active eligible membership and MFA.
8. Configure a draft rule version and source-cited requirements, then have the director review and approve it. Create a season, participant, mentor assignment and onboarding evidence. Synthetic seed records have no passwords and are not browser demo accounts. Never apply seed.sql to production.
9. Test invited adult and synthetic participant sessions in staging, including token expiry, MFA, revocation, two-club isolation through PostgREST, and the full assignment/submission/review flow. Record results before release. Do not invite real minors until consent and safeguarding policies are approved.

## Database policy tests

`npm run test:integration` uses embedded PostgreSQL locally. For native tests, set TEST_DATABASE_URL to a local PostgreSQL administrator database whose name ends in `_test`. The runner creates random disposable databases and removes only those databases. Native CI uses PostgreSQL 17. No remote or production URL is accepted by the native test harness.

## Rollback

Do not reverse a deployed migration with real records casually. Take and verify a backup, rehearse restoration in isolation, then use reviewed forward fixes or an approved restore. Append-only audit and signed records must retain their provenance. Disaster recovery has not yet been tested; it is a release gate.
