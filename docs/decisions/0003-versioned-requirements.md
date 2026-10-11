# ADR 0003 — Configurable curriculum, immutable approval history

Status: implemented first slice.

User decisions on 11 October 2026: support versioned, configurable requirements rather than one hardcoded interpretation; launch one club with club isolation retained.

A season references one club-scoped rule version. Onboarding settings are explicit fields, not official universal constants. The UI's initial values are labeled draft starting points. Requirements carry a level, department, required/optional type, source page and section. Six operational departments plus two distinct Special Operations categories are available.

A director approves a draft only after confirming the source reference. Approval freezes its settings and requirements. A later interpretation must create a new version; existing tasks and completions retain their original version. No curriculum from inaccessible PDFs has been claimed as verified. Sandbox requirements are original synthetic exercises, never official curriculum.

Admission requires approved rules, confirmed consent/registration, configurable grade/attendance/recommendation/probation criteria and an eligible primary mentor. Task assignment matches the participant's season and current level. Evidence versions and reviews are append-only to authenticated users. Verification is transactional, blocks self-review and stale/duplicate reviews, and creates a dated reviewer-linked checklist record. No points or automatic level promotion exist in this slice.
