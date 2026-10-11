# Initial threat model

## Current implementation addendum — 11 October 2026

The initial assessment below is historical. The app now accepts scoped authenticated writes and private imports. Twenty-two migrations enforce membership, adult eligibility, MFA, tenant scope, append-only review history and transactional workflow guards. Local integration fixtures cover two clubs; hosted multi-user and concurrency acceptance remains necessary.

AI execution is server-side, disabled by default and limited by tenant budgets and an isolated database runtime role. Provider credentials use authenticated encryption and are unavailable through browser table reads. Only explicitly requested proposals may be saved; a human approves event drafts and separately publishes them. Citation identifiers prove source membership, not semantic accuracy. Live provider, prompt-injection and global cost-control acceptance remain open.

PDF extraction runs in a bounded child process with stripped application environment. CSV boundaries, source provenance and human preview reduce import risk; scanned-page OCR is not yet implemented. Private records are never cached offline. Production nonce CSP and installation metadata are documented in release-security.md. Retention, backup restoration, production monitoring and authenticated accessibility are unfinished release gates.

PR 1 exposes static content and contains no user sessions, domain writes, uploads or remote AI calls. Security headers deny framing and unnecessary device permissions. Search indexing is disabled as a courtesy, not access control; any deployment must still be protected.

Before PR 2 accepts data: prove two-club isolation with real database RLS tests; prohibit self-assigned adult roles; validate revoked membership and scoped joins; record append-only redacted audit events. Service credentials stay in trusted server execution. Auth and authorization require independent checks.

Later gates include evidence upload scanning, signed private file URLs, approval concurrency, points idempotency, AI prompt injection and zero autonomous domain writes. Do not log youth details or provider keys. Adopt a tested production CSP, rate limits, retention and safeguarding procedures before release.
