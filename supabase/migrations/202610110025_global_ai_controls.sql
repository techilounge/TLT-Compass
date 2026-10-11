create table public.ai_global_settings (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 monthly_budget_usd numeric(12,6) not null default 0 check(monthly_budget_usd between 0 and 100000),
 attempts_per_minute integer not null default 60 check(attempts_per_minute between 1 and 10000),
 actor_attempts_per_minute integer not null default 10 check(actor_attempts_per_minute between 1 and 100),
 updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
insert into public.ai_global_settings(singleton) values(true);
alter table public.ai_global_settings enable row level security;
create policy global_ai_owner_read on public.ai_global_settings for select to authenticated using(public.is_platform_owner());
revoke all on public.ai_global_settings from public,anon,authenticated,tlt_ai_runtime;
grant select on public.ai_global_settings to authenticated;grant all on public.ai_global_settings to service_role;
create table public.ai_global_settings_history (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),enabled boolean not null,monthly_budget_usd numeric(12,6) not null,attempts_per_minute integer not null,actor_attempts_per_minute integer not null,created_at timestamptz not null default now()
);
alter table public.ai_global_settings_history enable row level security;
create policy global_ai_history_owner_read on public.ai_global_settings_history for select to authenticated using(public.is_platform_owner());
revoke all on public.ai_global_settings_history from public,anon,authenticated,tlt_ai_runtime;
grant select on public.ai_global_settings_history to authenticated;grant all on public.ai_global_settings_history to service_role;
create function public.configure_global_ai(ai_enabled boolean,monthly_budget numeric,minute_limit integer,actor_minute_limit integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_owner() then raise exception 'Not authorized' using errcode='42501';end if;
 if ai_enabled is null or monthly_budget is null or minute_limit is null or actor_minute_limit is null then raise exception 'Global settings required' using errcode='23514';end if;
 update public.ai_global_settings set enabled=ai_enabled,monthly_budget_usd=monthly_budget,attempts_per_minute=minute_limit,actor_attempts_per_minute=actor_minute_limit,updated_by=auth.uid(),updated_at=now() where singleton;
 insert into public.ai_global_settings_history(actor_id,enabled,monthly_budget_usd,attempts_per_minute,actor_attempts_per_minute) values(auth.uid(),ai_enabled,monthly_budget,minute_limit,actor_minute_limit);
end; $$;
alter function public.reserve_ai_attempt(uuid,uuid,text,uuid,integer,integer) rename to reserve_ai_attempt_tenant;
revoke all on function public.reserve_ai_attempt_tenant(uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated,tlt_ai_runtime;
create index ai_attempts_global_time on public.ai_attempts(created_at,actor_profile_id);
create function public.reserve_ai_attempt(target_club uuid,target_model uuid,task_purpose text,request_trace uuid,input_bound integer,output_bound integer) returns uuid language plpgsql security definer set search_path='' as $$
declare settings public.ai_global_settings;result uuid;spent numeric;attempt_count bigint;actor_count bigint;
begin
 if not public.can_run_ai(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 -- One global lock precedes the existing club lock, serializing reservations across tenants.
 select * into settings from public.ai_global_settings where singleton for update;
 if not found or not settings.enabled then raise exception 'Global AI disabled' using errcode='23514';end if;
 select count(*),count(*) filter(where actor_profile_id=auth.uid()) into attempt_count,actor_count from public.ai_attempts where created_at>now()-interval '1 minute';
 if attempt_count>=settings.attempts_per_minute or actor_count>=settings.actor_attempts_per_minute then raise exception 'Global AI rate limit reached' using errcode='23514';end if;
 result:=public.reserve_ai_attempt_tenant(target_club,target_model,task_purpose,request_trace,input_bound,output_bound);
 select coalesce(sum(reserved_usd),0) into spent from public.ai_attempts where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if spent>settings.monthly_budget_usd then raise exception 'Global AI budget reached' using errcode='23514';end if;
 return result;
end; $$;
revoke all on function public.configure_global_ai(boolean,numeric,integer,integer),public.reserve_ai_attempt(uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated,tlt_ai_runtime;
grant execute on function public.configure_global_ai(boolean,numeric,integer,integer) to authenticated;
grant execute on function public.reserve_ai_attempt(uuid,uuid,text,uuid,integer,integer) to authenticated,tlt_ai_runtime;
