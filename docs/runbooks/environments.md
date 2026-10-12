# Staging and production setup

This runbook is a plan; cloud environments are not provisioned by PR 1.

1. Establish main as reviewed release history, staging as integration history, and codex/* feature branches. Require CI and human review for protected branches.
2. Create GitHub staging and production environments. Require production reviewer approval and restrict permitted branches. Add deployment credentials only when deployment is implemented.
3. Create distinct Supabase projects for staging/production in PR 2. Keep service secrets server-side. Use synthetic records in staging.
4. Connect Vercel only after explicit deployment authorization. Map staging to its isolated project and production to main; keep ordinary previews protected.
5. Run migration/RLS and application checks before promotion. Document backup restore and migration rollback before live records.

Do not configure automatic public deployment for this foundation preview. Current CI is validation only. Account resources, budgets, domain and protection rules remain pending.
