# ADR 0002 — Session-scoped database access and explicit adult eligibility

Status: implemented locally, hosted validation pending.

Use Supabase SSR cookies with server-side getUser verification. Normal application requests use the publishable key and the user's JWT; they never use a service role. Authenticated routes are forced dynamic and are not cached. Database functions check current active membership, adult eligibility and MFA assurance (aal2), independent of browser role labels. Effective roles used for UI are computed in the database.

Enrollment and adult eligibility are trusted operator actions. A director can delegate or revoke eligible roles, but cannot self-promote or edit screening status. The first director is provisioned through a reviewed operator transaction. Default Supabase signup is disabled. Invitations/recovery use confirmed tokens and explicit redirect paths; no user-controlled redirect target is accepted.

RLS tests execute all application migrations in PGlite PostgreSQL locally. Auth uid/jwt functions are contract fixtures, so this does not test Supabase's JWT issuer, email delivery, token refresh or MFA service. The same suite can run on native PostgreSQL 17 in CI. A hosted staging test is still required before release.

The vulnerable Next ESLint preset was replaced with explicit JS/TypeScript, React Hooks, JSX accessibility and Prettier rules. This avoids its unpatched development dependency rather than suppressing the audit. Next-specific lint rules are not included in the replacement; builds and browser tests cover framework integration.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [PGlite](https://pglite.dev/docs/).
