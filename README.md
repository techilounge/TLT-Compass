# TLT Compass

Mobile-first Teen Leadership Training program manager with club isolation, MFA, configurable versioned curriculum, supervised Record Book reviews, attendance, training hours, private exports, recognition, calendar imports, AI provider controls and supervised games. Staging has 22 migrations applied. Live provider acceptance, hosted workflow validation and operational release gates remain open; this is not a production release.

## Local development

Use Node 22.17+ and npm 10+. Run `npm ci`, then `npm run dev` and open http://localhost:3000/sandbox for a synthetic walkthrough. It runs without credentials and discards state on reload. For the connected workspace, follow [Supabase setup](docs/runbooks/supabase-setup.md) and configure ignored `.env.local` using `.env.example`. Never commit credentials or youth information.

## Validation

Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run secrets:check`, `npm audit --audit-level=high`, and `npm run build`. Install Chromium with `npx playwright install chromium`, then run `npm run test:e2e`. Browser checks use a fresh production server on port 3100 and cover the practice workflow, keyboard entry, axe accessibility, light/dark modes and 320/375/768/1440px widths. Screenshots are local test artifacts.

Database tests apply every migration and exercise real PostgreSQL RLS, grants, triggers and transactional functions across two synthetic clubs. Auth identity functions are fixtures; hosted Supabase auth, email, MFA and PostgREST must be verified separately. CI includes a native PostgreSQL 17 job in addition to the embedded engine.

## Delivery

See [implementation status](docs/implementation-status.md), [decisions](docs/decisions.md), [architecture](docs/architecture.md), [first-slice review](docs/phase-1-review.md), [Phase 2 records](docs/phase-2-records.md), and [release readiness](docs/release-readiness.md). Follow AGENTS.md. The user authorized automatic phase progression; missing hands-on evidence stays documented. No deployment pipeline is enabled. Do not use synthetic rules as official curriculum or invite minors before release gates are satisfied.
