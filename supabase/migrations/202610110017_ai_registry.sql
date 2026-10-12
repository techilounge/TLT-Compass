-- Platform ownership is provisioned by an operator, never inferred from a club role.
create table public.platform_owners(profile_id uuid primary key references public.profiles(id),enabled boolean not null default true,created_at timestamptz not null default now());
alter table public.platform_owners enable row level security;
revoke all on public.platform_owners from public,anon,authenticated;
grant all on public.platform_owners to service_role;
create function public.is_platform_owner() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from public.platform_owners where profile_id=auth.uid() and enabled) $$;
create function public.can_configure_ai(target_club uuid) returns boolean language sql stable set search_path='' as $$ select public.is_platform_owner() and public.can_manage_program(target_club) $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='tlt_ai_runtime') then create role tlt_ai_runtime nologin; end if; end $$;
grant usage on schema public,auth to tlt_ai_runtime;
create function public.can_run_ai(target_club uuid) returns boolean language sql stable set search_path='' as $$ select public.can_configure_ai(target_club) or ((session_user='tlt_ai_runtime' or current_setting('role',true)='tlt_ai_runtime') and public.is_club_staff(target_club)) $$;
create table public.ai_settings (
  club_id uuid primary key references public.clubs(id),enabled boolean not null default false,
  monthly_budget_usd numeric(12,6) not null default 0 check(monthly_budget_usd between 0 and 10000),
  role_monthly_budget_usd numeric(12,6) not null default 0 check(role_monthly_budget_usd between 0 and 10000),
  request_ceiling_usd numeric(12,6) not null default 0 check(request_ceiling_usd between 0 and 10),
  max_output_tokens integer not null default 512 check(max_output_tokens between 32 and 16384),
  timeout_ms integer not null default 10000 check(timeout_ms between 1000 and 20000),
  max_attempts integer not null default 3 check(max_attempts between 1 and 5),
  circuit_failures integer not null default 3 check(circuit_failures between 1 and 10),
  cooldown_seconds integer not null default 300 check(cooldown_seconds between 30 and 86400)
);
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),name text not null check(length(trim(name)) between 1 and 80),
  provider_type text not null check(provider_type in ('openai_compatible','openrouter','anthropic','gemini')),
  base_url text not null check(length(base_url)<=300 and base_url like 'https://%'),
  credential_secret_ref text not null check(credential_secret_ref ~ '^AI_SECRET_[A-Z0-9_]{1,60}$'),
  priority integer not null check(priority between 0 and 1000),enabled boolean not null default false,privacy_approved boolean not null default false,
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(club_id,id)
);
create table public.ai_models (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),provider_id uuid not null,
  model_id text not null check(model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),purposes text[] not null check(cardinality(purposes) between 1 and 5 and purposes <@ array['assistant_chat','calendar_extract','question_generation','summarization','vision']),
  priority integer not null check(priority between 0 and 1000),context_limit integer not null check(context_limit between 256 and 2000000),max_output_tokens integer not null check(max_output_tokens between 32 and 16384),
  price_in_per_million numeric(12,6) not null check(price_in_per_million between 0 and 10000),price_out_per_million numeric(12,6) not null check(price_out_per_million between 0 and 10000),enabled boolean not null default false,
  configuration_fault boolean not null default false,circuit_until timestamptz,consecutive_failures integer not null default 0,last_check_at timestamptz,last_status text,last_error_code text,last_latency_ms integer,
  unique(club_id,id),unique(provider_id,model_id),foreign key(club_id,provider_id) references public.ai_providers(club_id,id)
);
create table public.ai_attempts (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),provider_id uuid not null,model_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id),actor_role text not null,purpose text not null check(purpose in ('assistant_chat','calendar_extract','question_generation','summarization','vision')),
  trace_id uuid not null,status text not null default 'reserved' check(status in ('reserved','succeeded','failed')),error_code text,
  latency_ms integer,input_tokens integer,output_tokens integer,reserved_usd numeric(12,6) not null check(reserved_usd>=0),estimated_cost_usd numeric(12,6),
  created_at timestamptz not null default now(),finished_at timestamptz,unique(club_id,id),
  foreign key(club_id,provider_id) references public.ai_providers(club_id,id),foreign key(club_id,model_id) references public.ai_models(club_id,id)
);
create index ai_attempts_budget on public.ai_attempts(club_id,created_at);
alter table public.ai_settings enable row level security;
alter table public.ai_providers enable row level security;
alter table public.ai_models enable row level security;
alter table public.ai_attempts enable row level security;
create policy ai_settings_read on public.ai_settings for select to authenticated using(public.is_club_staff(club_id));
create policy ai_providers_read on public.ai_providers for select to authenticated using(public.is_club_staff(club_id));
create policy ai_models_read on public.ai_models for select to authenticated using(public.is_club_staff(club_id));
create policy ai_attempts_read on public.ai_attempts for select to authenticated using(public.can_manage_program(club_id) or (actor_profile_id=auth.uid() and public.is_club_staff(club_id)));
create policy ai_settings_owner on public.ai_settings for all to authenticated using(public.can_configure_ai(club_id)) with check(public.can_configure_ai(club_id));
create policy ai_providers_owner on public.ai_providers for all to authenticated using(public.can_configure_ai(club_id)) with check(public.can_configure_ai(club_id));
create policy ai_models_owner on public.ai_models for all to authenticated using(public.can_configure_ai(club_id)) with check(public.can_configure_ai(club_id));
revoke all on public.ai_settings,public.ai_providers,public.ai_models,public.ai_attempts from public,anon,authenticated;
grant select on public.ai_settings,public.ai_providers,public.ai_models,public.ai_attempts to authenticated;
grant insert,update on public.ai_settings,public.ai_providers to authenticated;
grant insert(club_id,provider_id,model_id,purposes,priority,context_limit,max_output_tokens,price_in_per_million,price_out_per_million,enabled),update(model_id,purposes,priority,context_limit,max_output_tokens,price_in_per_million,price_out_per_million,enabled) on public.ai_models to authenticated;
grant all on public.ai_settings,public.ai_providers,public.ai_models,public.ai_attempts to service_role;
create trigger audit_ai_settings after insert or update on public.ai_settings for each row execute function public.audit_change();
create trigger audit_ai_providers after insert or update on public.ai_providers for each row execute function public.audit_change();
create trigger audit_ai_models after insert or update on public.ai_models for each row execute function public.audit_change();
create function public.reserve_ai_attempt(target_club uuid,target_model uuid,task_purpose text,request_trace uuid,input_bound integer,output_bound integer) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.ai_settings;m public.ai_models;p public.ai_providers;roles text[];role_name text;reserved numeric;used numeric;role_used numeric;result uuid;
begin
  if not public.can_run_ai(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=target_club for update;
  select * into s from public.ai_settings where club_id=target_club;
  if not found or not s.enabled then raise exception 'AI disabled' using errcode='23514'; end if;
  select * into m from public.ai_models where club_id=target_club and id=target_model;
  select * into p from public.ai_providers where club_id=target_club and id=m.provider_id;
  if not found or not m.enabled or not p.enabled or not p.privacy_approved or m.configuration_fault or m.circuit_until>now() or not task_purpose=any(m.purposes) then raise exception 'AI route unavailable' using errcode='23514'; end if;
  if input_bound not between 1 and 100000 or output_bound not between 1 and least(m.max_output_tokens,s.max_output_tokens) or input_bound+output_bound>m.context_limit then raise exception 'AI token bounds invalid' using errcode='23514'; end if;
  select array_agg(r::text) into roles from public.effective_club_roles(target_club) r;
  role_name:=case when 'director'=any(roles) then 'director' when 'coordinator'=any(roles) then 'coordinator' when 'primary_mentor'=any(roles) then 'primary_mentor' else 'operational_mentor' end;
  reserved:=ceil(((input_bound*m.price_in_per_million+output_bound*m.price_out_per_million)/1000000)*1000000)/1000000;
  select coalesce(sum(reserved_usd),0),coalesce(sum(reserved_usd) filter(where actor_role=role_name),0) into used,role_used from public.ai_attempts where club_id=target_club and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if reserved>s.request_ceiling_usd or used+reserved>s.monthly_budget_usd or role_used+reserved>s.role_monthly_budget_usd or (select count(*) from public.ai_attempts where club_id=target_club and actor_profile_id=auth.uid() and created_at>now()-interval '1 minute')>=10 or (select count(*) from public.ai_attempts where club_id=target_club and trace_id=request_trace)>=s.max_attempts then raise exception 'AI budget or rate limit reached' using errcode='23514'; end if;
  insert into public.ai_attempts(club_id,provider_id,model_id,actor_profile_id,actor_role,purpose,trace_id,reserved_usd) values(target_club,p.id,m.id,auth.uid(),role_name,task_purpose,request_trace,reserved) returning id into result;return result;
end; $$;
create function public.finish_ai_attempt(target_attempt uuid,result_status text,result_error text,elapsed_ms integer,tokens_in integer,tokens_out integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.ai_attempts;m public.ai_models;s public.ai_settings;failures integer;
begin
  select * into a from public.ai_attempts where id=target_attempt;
  if not found or a.actor_profile_id<>auth.uid() or not public.can_run_ai(a.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=a.club_id for update;
  select * into a from public.ai_attempts where id=target_attempt for update;
  if a.status<>'reserved' then raise exception 'Attempt already finished' using errcode='23514'; end if;
  if result_status not in ('succeeded','failed') or coalesce(result_error,'') not in ('','credentials','permission','configuration','rate_limit','upstream','timeout','network','invalid_output','safety','budget','unavailable') or elapsed_ms not between 0 and 120000 or (tokens_in is not null and tokens_in not between 0 and 10000000) or (tokens_out is not null and tokens_out not between 0 and 10000000) then raise exception 'Invalid attempt result' using errcode='23514'; end if;
  select * into m from public.ai_models where id=a.model_id for update;select * into s from public.ai_settings where club_id=a.club_id;
  failures:=case when result_status='succeeded' then 0 else m.consecutive_failures+1 end;
  update public.ai_attempts set status=result_status,error_code=result_error,latency_ms=elapsed_ms,input_tokens=tokens_in,output_tokens=tokens_out,estimated_cost_usd=case when tokens_in is not null and tokens_out is not null then (tokens_in*m.price_in_per_million+tokens_out*m.price_out_per_million)/1000000 end,finished_at=now() where id=a.id;
  update public.ai_models set configuration_fault=configuration_fault or coalesce(result_error in ('credentials','permission','configuration'),false),consecutive_failures=failures,circuit_until=case when result_status='succeeded' then null when result_error='rate_limit' or failures>=s.circuit_failures then now()+make_interval(secs=>s.cooldown_seconds) else circuit_until end,last_check_at=now(),last_status=result_status,last_error_code=result_error,last_latency_ms=elapsed_ms where id=m.id;
end; $$;
create function public.reset_ai_route(target_model uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.ai_models;
begin
  select * into m from public.ai_models where id=target_model;
  if not found or not public.can_configure_ai(m.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.ai_models set configuration_fault=false,circuit_until=null,consecutive_failures=0,last_status=null,last_error_code=null,last_check_at=null where id=m.id;
end; $$;
revoke all on function public.is_platform_owner(),public.can_configure_ai(uuid),public.reserve_ai_attempt(uuid,uuid,text,uuid,integer,integer),public.finish_ai_attempt(uuid,text,text,integer,integer,integer),public.reset_ai_route(uuid) from public,anon,authenticated;
grant execute on function public.is_platform_owner(),public.can_configure_ai(uuid),public.reserve_ai_attempt(uuid,uuid,text,uuid,integer,integer),public.finish_ai_attempt(uuid,text,text,integer,integer,integer),public.reset_ai_route(uuid) to authenticated;
revoke all on function public.can_run_ai(uuid) from public,anon,authenticated;
grant execute on function public.can_run_ai(uuid) to authenticated;
grant execute on function public.reserve_ai_attempt(uuid,uuid,text,uuid,integer,integer),public.finish_ai_attempt(uuid,text,text,integer,integer,integer) to tlt_ai_runtime;
