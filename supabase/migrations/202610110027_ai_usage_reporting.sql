alter table public.ai_settings add column usage_alert_percent integer not null default 80 check(usage_alert_percent between 1 and 100);
create function public.ai_usage_payload(target_club uuid,target_actor uuid) returns jsonb language sql stable set search_path='' as $$
 with month_attempts as (
  select a.* from public.ai_attempts a where (target_club is null or a.club_id=target_club) and (target_actor is null or a.actor_profile_id=target_actor)
  and a.created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
 ),daily as (
  select (created_at at time zone 'UTC')::date as usage_day,count(*) attempts,sum(reserved_usd) reserved_usd from month_attempts group by 1
 )
 select jsonb_build_object('month_utc',to_char(now() at time zone 'UTC','YYYY-MM'),
 'attempts',(select count(*) from month_attempts),'succeeded',(select count(*) from month_attempts where status='succeeded'),
 'failed',(select count(*) from month_attempts where status='failed'),'in_flight',(select count(*) from month_attempts where status='reserved'),
 'reserved_usd',(select coalesce(sum(reserved_usd),0) from month_attempts),'estimated_usd',(select coalesce(sum(estimated_cost_usd),0) from month_attempts),
 'days',(select coalesce(jsonb_agg(jsonb_build_object('day',usage_day,'attempts',attempts,'reserved_usd',reserved_usd) order by usage_day),'[]'::jsonb) from daily));
$$;
create function public.club_ai_usage(target_club uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_club_staff(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 return public.ai_usage_payload(target_club,case when public.can_manage_program(target_club) then null else auth.uid() end)||jsonb_build_object('scope',case when public.can_manage_program(target_club) then 'club' else 'own' end);
end; $$;
create function public.global_ai_usage() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_owner() then raise exception 'Not authorized' using errcode='42501';end if;
 return public.ai_usage_payload(null,null)||jsonb_build_object('scope','platform');
end; $$;
revoke all on function public.ai_usage_payload(uuid,uuid),public.club_ai_usage(uuid),public.global_ai_usage() from public,anon,authenticated,tlt_ai_runtime;
grant execute on function public.club_ai_usage(uuid),public.global_ai_usage() to authenticated;

