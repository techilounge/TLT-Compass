create function public.move_ai_provider(target_club uuid,target_provider uuid,direction integer) returns void language plpgsql security definer set search_path='' as $$
declare provider_ids uuid[];position integer;other_position integer;temporary uuid;total integer;
begin
 if not public.can_configure_ai(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 if direction is null or direction not in (-1,1) then raise exception 'Invalid direction' using errcode='23514';end if;
 perform 1 from public.clubs where id=target_club for update;
 select array_agg(id order by priority,id),count(*) into provider_ids,total from public.ai_providers where club_id=target_club;
 position:=array_position(provider_ids,target_provider);
 if position is null then raise exception 'Not authorized' using errcode='42501';end if;
 if total>1000 then raise exception 'Provider limit exceeded' using errcode='23514';end if;
 other_position:=position+direction;
 if other_position<1 or other_position>total then return;end if;
 temporary:=provider_ids[position];provider_ids[position]:=provider_ids[other_position];provider_ids[other_position]:=temporary;
 update public.ai_providers p set priority=ordered.ordinality-1 from unnest(provider_ids) with ordinality ordered(id,ordinality) where p.club_id=target_club and p.id=ordered.id;
end; $$;
revoke all on function public.move_ai_provider(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.move_ai_provider(uuid,uuid,integer) to authenticated;
create function public.club_ai_usage_breakdown(target_club uuid,window_days integer default 14) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid;
begin
 if not public.is_club_staff(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 if window_days is null or window_days not between 1 and 31 then raise exception 'Invalid reporting window' using errcode='23514';end if;
 actor:=case when public.can_manage_program(target_club) then null else auth.uid() end;
 return (with grouped as (
 select (a.created_at at time zone 'UTC')::date usage_day,p.name provider,m.model_id model,count(*) calls,count(*) filter(where a.status='failed') failed,
 sum(a.input_tokens) input_tokens,sum(a.output_tokens) output_tokens,count(*) filter(where a.input_tokens is null or a.output_tokens is null) unknown_token_calls,
 percentile_cont(0.5) within group(order by a.latency_ms) p50_ms,percentile_cont(0.95) within group(order by a.latency_ms) p95_ms,sum(a.reserved_usd) reserved_usd,sum(a.estimated_cost_usd) estimated_usd
 from public.ai_attempts a join public.ai_providers p on p.club_id=a.club_id and p.id=a.provider_id join public.ai_models m on m.club_id=a.club_id and m.id=a.model_id
 where a.club_id=target_club and (actor is null or a.actor_profile_id=actor) and a.created_at>=((now() at time zone 'UTC')::date-(window_days-1))::timestamp at time zone 'UTC'
 group by 1,p.id,p.name,m.id,m.model_id
 ),bounded as(select * from grouped order by usage_day desc,provider,model limit 1000)
 select jsonb_build_object('window_days',window_days,'scope',case when actor is null then 'club' else 'own' end,'total_groups',(select count(*) from grouped),'rows',(select coalesce(jsonb_agg(to_jsonb(bounded) order by usage_day desc,provider,model),'[]'::jsonb) from bounded)));
end; $$;
revoke all on function public.club_ai_usage_breakdown(uuid,integer) from public,anon,authenticated,tlt_ai_runtime;
grant execute on function public.club_ai_usage_breakdown(uuid,integer) to authenticated;
