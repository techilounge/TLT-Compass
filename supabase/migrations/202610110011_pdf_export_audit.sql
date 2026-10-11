create or replace function public.log_record_export(target_participant uuid,export_format text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants;
begin
  select * into p from public.tlt_participants where id=target_participant;
  if not found or not public.can_access_participant(p.club_id,p.id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if export_format is null or export_format not in ('csv','print','pdf') then raise exception 'Invalid export format' using errcode='23514'; end if;
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details)
    values(p.club_id,auth.uid(),'export_generated','participant_record',p.id::text,jsonb_build_object('format',export_format));
end;
$$;
