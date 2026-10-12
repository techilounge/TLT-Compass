# Deployment and rollback procedure

Status: prepared procedure, not an executed deployment or recovery rehearsal. Frontend remains local; staging database is configured. Public/youth release requires explicit authorization and the acceptance evidence in release-readiness.md. Automatic phase progression does not authorize public deployment.

## Release record

Before deployment, record the approved commit, passing CI run, migration filenames/checksums, target project IDs, previous frontend deployment ID, responsible operator, director approval and rollback decision owner. Record environment variable names and secret-manager version references, never secret values. Keep this operational record private when it contains infrastructure or account details.

## Staging rehearsal

1. Create an isolated frontend preview and verify its target is staging, with no production credentials. Configure Supabase URL/publishable key, restricted AI runtime connection and encryption key through server environment settings. Never expose the database URL or encryption key through NEXT_PUBLIC variables. Public variables are compiled into the browser build; build for the intended target.
2. Confirm global AI is off and budgets are zero before testing non-AI workflows. Configure only approved auth redirects to the exact preview origin and verify password setup, sign-in, MFA, logout and account recovery without recording tokens or QR secrets.
3. Apply only pending reviewed migrations with the existing staging migration operator. The script validates the configured project host and migration history; do not point it at production as a shortcut. Production migration tooling must explicitly validate a separately authorized production target before use.
4. Run the synthetic multi-role pilot: director, two mentors and three to six participants across a mock season. Exercise onboarding, mentor revocation, task drafts/assignment/submission/review, attendance/hours, points/reversal, private exports, reviewed calendar import/rollback, proposal approval and consent withdrawal. Add a second synthetic club and test denied reads/writes/exports. Do not invite actual minors for this rehearsal.
5. Compare records against the manual fixture; document discrepancies and the blueprint's 95% reconciliation target. Review mobile and keyboard behavior on authenticated routes, private response caching, logs and failure messages. Restore the isolated fixture before repeating destructive scenarios.
6. If provider credentials and budgets are explicitly approved, test safe synthetic inference and failover. Record estimated versus provider-billed costs, redacted error classification, cited source accuracy, prompt-injection behavior and the absence of autonomous domain writes. Keep core workflows working when AI is disabled.

## Production release

Proceed only after policy, safeguarding, retention/deletion, monitoring, private evidence handling, performance, real recovery and director workflow gates are accepted. Confirm TLS/domain ownership, protected deployments, isolated production secrets, backup access and operator alerts. Production infrastructure has not been provisioned by this task.

Use additive, backward-compatible database migrations before promoting the approved frontend artifact. Review the exact migration for lock duration, data changes and compatibility with the previous application. A failed migration must halt promotion. Disable AI during an AI-specific incident; do not rely on provider failure to stop spending. After promotion, verify authenticated access, role separation, one synthetic workflow, errors and spend, and record the outcome. No automatic youth invitations are part of deployment.

## Rollback decision

- Frontend regression with a compatible database: restore the last accepted frontend deployment, then repeat auth/MFA, RLS and workflow smoke checks. Confirm that deployment's environment settings and encryption key references are still correct. Vercel rollback reuses the previous deployment's environment configuration; it does not incorporate newly edited settings. See [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback).
- Database regression: stop affected writes through a reviewed maintenance procedure. Do not delete migration history or run an improvised reverse migration. Prefer a reviewed corrective migration that preserves accepted records. If restoration is necessary, use an isolated target and the recovery procedure; quantify records changed since the backup and obtain the responsible operator's data-loss decision before switching traffic.
- Credential exposure: disable the affected route, rotate the provider credential, review audit/access records and replace impacted runtime secrets. Preserve encryption-key versions required to decrypt existing credentials under an approved rotation/re-encryption procedure; replacing the key alone makes existing ciphertext unusable.
- Consent/authorization defect: restrict the affected workflow, preserve audit evidence and involve the responsible safeguarding/privacy personnel. AI does not adjudicate the incident. Confirm revoked access across sessions before resuming.

## Recovery dependencies

Supabase database backups exclude the underlying Storage files. Inventory database/Auth data, Storage objects and policies, runtime roles/passwords, application configuration and separately held encryption keys. See [Supabase backups](https://supabase.com/docs/guides/platform/backups) and [restore to a new project](https://supabase.com/docs/guides/platform/clone-project). The passing same-instance synthetic PostgreSQL restore does not validate these external dependencies.

Set recovery time and acceptable data-loss objectives with the responsible operator; none are assumed here. Record an authorized isolated restore's elapsed time, backup age, authenticated access, file integrity and credential decryption. Do not mark the release gate complete until the operator accepts that evidence.
