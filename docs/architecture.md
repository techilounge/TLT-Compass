# Architecture

## First operational slice

Supabase SSR clients in lib/db support cookie sessions, server getUser verification and proxy refresh. Protected account/workspace layouts are dynamic. Normal requests use the publishable key and user JWT; no service role exists in runtime code. Every domain read goes through RLS. Adult authority requires active club membership, recorded eligibility and aal2 MFA in the database. Server actions validate form inputs with Zod; controlled PostgreSQL functions own admission, mentor assignments, task submission and review transactions.

Five migrations implement identity/memberships/audit, versioned curriculum and Record Book, assignment history/scope guards, review/reference guards, and effective roles. Both composite foreign keys and authorization functions constrain club scope. Signed records retain the historical rule version. The independent /sandbox client collects only practice text in memory and has no connection to authenticated data.

The integration suite runs these migrations in PostgreSQL with a fixture Auth identity contract, locally via PGlite and in configured native PostgreSQL CI. Hosted Supabase Auth and PostgREST are separate validation boundaries. See release-readiness.md for missing modules and release controls.

## Historical bootstrap boundary

Next.js App Router renders the foundation shell. Tailwind tokens and owned shadcn-style primitives live in app/globals.css and components/ui. Zod validates external configuration. Vitest covers validation; Playwright exercises the production build and axe accessibility.

Future modules contain service boundaries for clubs, participants, program rules, approvals, points and audit. Supabase supplies auth, Postgres RLS and private storage. Every operation must validate membership and tenant scope on the server; RLS provides an independent boundary. Browser identity is not membership authority.

No migrations, auth endpoints, participant records or AI calls exist in PR 1. Those are deliberate phase boundaries. PR 2 introduces migrations and mandatory two-club isolation tests. CI must add migration and RLS gates before those features merge.

Upstream setup references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint), [shadcn manual setup](https://ui.shadcn.com/docs/installation/manual), [Tailwind Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
