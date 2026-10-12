# Acceptance evidence

## Current first-slice evidence — 11 October 2026

Local Windows checks: production build, ESLint, strict TypeScript, formatting, six unit tests, 25 PostgreSQL policy/workflow tests and 18 Chromium browser cases pass. The audit reports zero vulnerabilities. The local recognized-pattern secret scan passes; it is a baseline scan, not a complete historical/provider secret detection service.

Database tests cover two-club isolation, MFA, unscreened adults, self-promotion, membership/screening revocation, immutable/redacted audit, draft/approved rule handling, immutable version history, mentor admission checks, evidence revisions, stale and duplicate review rejection, self-review prevention, signed checklist records, tenant references, consent withdrawal and rotation scope. They use PGlite PostgreSQL with an Auth identity-contract fixture. The native PostgreSQL 17 CI path is configured but not executed locally.

Browser tests cover the synthetic task assignment → submission → changes → resubmission → sign-off flow, unconfigured auth redirects, CSS loading, overflow, axe WCAG A/AA checks and light/dark 320/375/768/1440px layouts. Manually inspected sandbox mobile light and desktop dark screenshots. Artifacts are in test-results/. Browser workflow tests do not replace a real authenticated Supabase staging walkthrough.

The previous audit blocker is resolved by removing the vulnerable Next ESLint preset and explicitly configuring JS/TypeScript, React Hooks, JSX accessibility and Prettier lint rules. No advisory suppression or forced framework downgrade was applied.

Not yet validated: hosted Auth/MFA/email/session refresh/PostgREST, native CI execution, actual concurrency under multiple connections, live migration rollout, complete curriculum verification, disaster restore, load testing, production privacy/safeguarding, or public deployment. Authentication routes remain forced dynamic and unconfigured deployments fail closed. Source PDFs remain unverified.

## Historical Phase 0 PR 1 evidence

Validated locally on Windows with Node 22.17 / npm 10.9.2, 10–11 October 2026 (America/Chicago).

- Production build: passed; root and not-found pages prerender successfully.
- Strict TypeScript: passed.
- ESLint: passed after replacing the home anchor with Next Link.
- Prettier: passed.
- Vitest: 3 passed (unconfigured bootstrap, invalid/partial config rejection, server-secret exclusion).
- Chromium: 8 browser cases passed, light/dark at 320/375/768/1440px. Each checks axe WCAG A/AA results, horizontal overflow, keyboard skip navigation and journey anchor navigation. Screenshots: test-results/foundation-{light|dark}-{width}.png. Manually inspected mobile light and desktop dark layouts.

## Blocking dependency finding

Full npm audit reports five high entries caused by one vulnerable braces dependency through micromatch → fast-glob → Next ESLint plugin/config (GHSA-vfj7-8cjw-p6xm). Registry checks returned braces 3.0.3 and eslint-config-next 16.4.0 as latest; no patched compatible upgrade was available. npm suggests a major downgrade to Next ESLint config 14, which is not compatible with this foundation's selected Next version. No suppression or blind forced downgrade applied. CI intentionally blocks on the audit finding. This is development tooling; it still requires resolution before claiming all gates green.

## Scope and remaining setup

Changes are local and uncommitted. No remote branches, PR, cloud environments or deployment were created. Staging setup is documented, not established. Hosted GitHub checks and dedicated secret scanning remain pending repository setup. No database/auth code exists; migration and two-club RLS checks belong to PR 2 and have not run.

No copyrighted PDF content or real participant records were imported. G: source references are inaccessible; formal curriculum validation remains pending.

## Manual review

Run npm ci, npm run dev, and visit localhost:3000. Check the preview at phone and desktop sizes, system dark mode and keyboard-only navigation. Confirm this nonoperational preview is appropriate before continuing to PR 2. Resolve the audit blocker, establish reviewed Git history and staging protections, then add Supabase migrations and mandatory isolation tests.

## Release hardening — 11 October 2026

All 50 production browser cases passed using synthetic configured and unconfigured servers, including nonce CSP hydration and manifest/icons. Windows runner required interruption after all case results because shutdown remained open; no claim of a clean runner exit is made. Existing unit suite: 49 passing; SQL suite: 81 passing. Production build and TypeScript passed. Lint corrected an explicit Node process import in the browser fixture builder. Native PostgreSQL CI and hosted authenticated acceptance remain pending.
