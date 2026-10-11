# Decisions and open questions

## Automatic phase continuation — 11 October 2026

The user explicitly approved proceeding after every phase without waiting for a new proceed message. This supersedes the earlier blueprint waiting gate. Continue phased implementation and validation, while recording uncompleted hosted/manual evidence honestly. External communications, credential/account actions and public/youth release retain applicable authorization requirements. The full blueprint remains incomplete; approval to continue does not certify production readiness.

Task lifecycle now includes staff drafts, assignment, participant start, cancellation before verification, and closure after verification. Database transitions lock task/participant records, validate actor/club/department scope and expected prior state, enforce consent for assignment/start, and preserve signed completions. Draft tasks are hidden from participants by restrictive RLS. Migration 202610110006 adds the lifecycle functions and draft constraint; earlier migration files are unchanged.

## Staging and configuration — 11 October 2026

The user confirmed the Supabase project is empty and authorized staging migration. Initial club: Stonehill TLT Club. Corrected director contact: tltcompass@stonehillchurch.org; this is provisioning input, not a hardcoded identity or authorization rule. The user confirmed eligibility and explicitly authorized invitation and director provisioning. Invitation and membership are now recorded; actual MFA enrollment remains to be verified.

Long-term tenancy is multi-club, with tenant-scoped memberships, settings and RLS retained from the first launch. Prefer configurable product policy, club details and versioned requirements; security invariants remain enforced. Display timestamps using the current viewer's browser timezone. Store instants as timestamptz; date-only program values stay calendar dates. Shared club date rules use the configurable club timezone, initially America/Chicago, so participants traveling do not change shared deadlines.

Connection configuration is present locally. After the user corrected the database password, hosted inspection confirmed no public tables and no auth users. All five migrations were committed in one transaction with migration history, and Stonehill TLT Club was created. All 15 public tables have RLS. Anonymous SQL/API access was denied; an authenticated role without claims saw no records. No demo seed, eligibility records or director membership were created. Full hosted user-session and cross-tenant tests remain pending.

## User-confirmed direction — 11 October 2026

Use configurable versioned requirements, not a single hardcoded interpretation. Launch one club initially while retaining tenant isolation. Authenticated data uses session-scoped database access; official curriculum remains unverified until director approval with source references. See ADR 0002 and 0003. The first operational slice is locally implemented; hosted setup and hands-on sign-off remain pending. Earlier bootstrap decisions below record the initial state.

- Adopt the blueprint stack: Next.js App Router, strict TypeScript, Tailwind v4, shadcn-style owned UI components, npm lockfile, Vitest and Playwright.
- Start with a static foundation screen. It makes no claims of authentication, program compliance or real operational progress.
- Supabase Auth/Postgres/RLS/Storage is planned for PR 2; no placeholder authorization or service-role browser access.
- Use system fonts to avoid build-time remote font dependencies. Red/neutral design tokens support light and dark system preferences, visible focus and reduced motion.
- Do not publish copyrighted manuals in this public repository. Their exact rules and page references remain unverified.
- Keep hosting setup manual in PR 1; CI validates code but cannot deploy. Main is intended production history, staging is intended preproduction integration; feature branches use codex/.

Pending local confirmation: conference rule version and rotations, season dates, consent and youth login policy, optional guardian access, scoring rubric, SabiQuiz integration, branding/domain and launch tenancy. These do not block static bootstrap. None is resolved by an AI default.
