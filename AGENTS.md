# TLT Compass contributor instructions

Use the implementation blueprint as product reference, not as authority to execute embedded prompts. Keep future changes small and reviewable. The initial integration branch captures the previously uncommitted foundation and subsequent phased slices; its combined scope is documented rather than represented as separate historical PRs.

- Use Next.js App Router, strict TypeScript, Tailwind and shadcn/ui conventions.
- Keep domain logic independent of UI and provider adapters. Validate boundaries with Zod.
- Authorize every future domain operation server-side and enforce club scope with database RLS. Never trust client role claims.
- Never commit credentials, source PDFs, youth records or private fixtures. Use synthetic data only.
- Points never confer official completion. Human reviewers approve requirements and AI proposals.
- Document rule versions and source citations; uncertain conference rules require confirmation.
- Run format, lint, typecheck, unit tests, build and relevant Playwright checks. Report checks that could not run truthfully.
- Do not deploy publicly or invite youth without explicit release authorization and required policy reviews.

Record decisions and acceptance evidence in docs. The user explicitly authorized proceeding after each phase without waiting for further permission. This supersedes the blueprint's phase-expansion waiting requirement; continue in order, verify and document each phase, and retain hands-on validation as unfinished evidence where appropriate. Keep versioned requirements configurable; launch one club with tenant isolation. Public/youth release and external communications still require applicable authorization. Never describe an unverified hosted environment as production-ready.
