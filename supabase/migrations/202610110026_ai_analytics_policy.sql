alter table public.ai_settings add column analytics_minimum_cohort integer not null default 5 check(analytics_minimum_cohort between 1 and 100);
