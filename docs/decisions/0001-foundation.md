# ADR 0001 — Foundation before domain features

Status: accepted for PR 1.

The repository is empty and the blueprint separates bootstrap from authentication and tenancy. Adopt Next.js App Router, TypeScript strict mode, Tailwind v4, owned shadcn-style primitives, Zod, Vitest and Playwright. Use npm with a committed lockfile and system fonts.

This gives a reproducible shell without pretending operational features exist. Supabase configuration, migrations and authentication remain in PR 2. TanStack Query and React Hook Form will be added with the first feature requiring client data or forms, avoiding unused runtime infrastructure.
