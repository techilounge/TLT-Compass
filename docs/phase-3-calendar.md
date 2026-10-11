# Phase 3 calendar continuation

Manual month/week/agenda calendar, explicit IANA timezones, bounded recurring series, private edits with revision guards, reviewed conflict overrides, cancellation history, RSVP, attendance linkage, audited ICS and staff roster CSV are implemented. CSV imports support configurable columns, bounded UTF-8 input, per-row corrections, unresolved dates, duplicates, atomic publication and rollback that preserves history. PDF jobs retain private originals, extract in a bounded child process without application credentials, retain source pages/text and produce private editable previews. No AI publication or guessed missing dates is permitted.

Migrations 014–016 applied to authorized staging on 11 October 2026, without synthetic seeds. Validation before application: 31 unit and 61 SQL integration tests passed; lint, typecheck and production build passed. Eight focused unauthenticated calendar browser boundary cases passed. These are not authenticated workflow or accessibility acceptance evidence.

Remaining acceptance: authenticated desktop/mobile visual and accessibility walkthroughs, hosted multi-user isolation and native PostgreSQL concurrency evidence, retention/deletion and upload scanning operations, monitored background-worker execution. PDF jobs currently run through an authenticated resumable browser-triggered endpoint; there is no external job scheduler. Scanned PDFs remain unresolved for human entry; OCR/vision and AI extraction are pending. Source text is untrusted data, including embedded instructions.

Development continues directly into Phase 4; this does not declare all Phase 3 release criteria complete.
