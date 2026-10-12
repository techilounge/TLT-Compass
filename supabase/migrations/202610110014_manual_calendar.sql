create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),
  title text not null check(length(trim(title)) between 1 and 160),description text not null default '' check(length(description)<=4000),
  location text not null default '' check(length(location)<=300),category text not null check(length(trim(category)) between 1 and 80),organizer text not null default '' check(length(organizer)<=120),
  timezone text not null,all_day boolean not null,visibility text not null check(visibility in ('club','staff')),
  recurrence jsonb not null,status text not null default 'published' check(status in ('published','cancelled')),
  revision integer not null default 1 check(revision>0),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  unique(club_id,id)
);
create table public.calendar_occurrences (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),event_id uuid not null,sequence integer not null check(sequence between 1 and 104),
  starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
  attendance_session_id uuid,unique(club_id,id),unique(event_id,sequence),check(ends_at>starts_at and ends_at-starts_at<=interval '14 days'),
  foreign key(club_id,event_id) references public.calendar_events(club_id,id),foreign key(club_id,attendance_session_id) references public.attendance_sessions(club_id,id)
);
create index calendar_occurrences_window on public.calendar_occurrences(club_id,starts_at,ends_at);
create table public.calendar_drafts (
  id uuid primary key,club_id uuid not null references public.clubs(id),base_event_id uuid,expected_revision integer not null default 0,
  payload jsonb not null,status text not null default 'draft' check(status in ('draft','published','discarded')),
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),published_event_id uuid,
  source_kind text not null default 'manual' check(source_kind in ('manual','csv','pdf')),
  source_reference text not null default '' check(length(source_reference)<=500),
  unique(club_id,id),foreign key(club_id,base_event_id) references public.calendar_events(club_id,id),foreign key(club_id,published_event_id) references public.calendar_events(club_id,id)
);
create table public.event_rsvps (
  club_id uuid not null references public.clubs(id),occurrence_id uuid not null,participant_id uuid not null,
  response text not null check(response in ('yes','no','maybe')),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  primary key(club_id,occurrence_id,participant_id),foreign key(club_id,occurrence_id) references public.calendar_occurrences(club_id,id),foreign key(club_id,participant_id) references public.tlt_participants(club_id,id)
);
alter table public.calendar_events enable row level security;
alter table public.calendar_occurrences enable row level security;
alter table public.calendar_drafts enable row level security;
alter table public.event_rsvps enable row level security;
create policy calendar_events_read on public.calendar_events for select to authenticated using(public.is_club_staff(club_id) or (visibility='club' and public.has_club_role(club_id,array['participant']::public.club_role[])));
create policy calendar_occurrences_read on public.calendar_occurrences for select to authenticated using(exists(select 1 from public.calendar_events e where e.club_id=calendar_occurrences.club_id and e.id=calendar_occurrences.event_id));
create policy calendar_drafts_read on public.calendar_drafts for select to authenticated using(public.can_manage_program(club_id));
create policy event_rsvps_read on public.event_rsvps for select to authenticated using(public.can_access_participant(club_id,participant_id) and exists(select 1 from public.calendar_occurrences o where o.club_id=event_rsvps.club_id and o.id=event_rsvps.occurrence_id));
revoke all on public.calendar_events,public.calendar_occurrences,public.calendar_drafts,public.event_rsvps from public,anon,authenticated;
grant select on public.calendar_events,public.calendar_occurrences,public.calendar_drafts,public.event_rsvps to authenticated;
grant all on public.calendar_events,public.calendar_occurrences,public.calendar_drafts,public.event_rsvps to service_role;
create trigger audit_calendar_events after insert or update on public.calendar_events for each row execute function public.audit_change();
create trigger audit_calendar_occurrences after insert or update on public.calendar_occurrences for each row execute function public.audit_change();
create trigger audit_calendar_drafts after insert or update on public.calendar_drafts for each row execute function public.audit_change();
create trigger audit_rsvps after insert or update on public.event_rsvps for each row execute function public.audit_change();
create function public.validate_calendar_payload(payload jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb;begins timestamptz;ends timestamptz;previous_end timestamptz;first_start timestamptz;
begin
  if jsonb_typeof(payload) is distinct from 'object' or (payload-array['title','description','location','category','organizer','timezone','all_day','visibility','recurrence','occurrences'])<>'{}'::jsonb then raise exception 'Invalid event schema' using errcode='23514'; end if;
  if length(trim(coalesce(payload->>'title',''))) not between 1 and 160 or length(coalesce(payload->>'description',''))>4000 or length(coalesce(payload->>'location',''))>300 or length(coalesce(payload->>'organizer',''))>120 or length(trim(coalesce(payload->>'category',''))) not between 1 and 80 then raise exception 'Invalid event details' using errcode='23514'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=payload->>'timezone') or coalesce(payload->>'visibility','') not in ('club','staff') or jsonb_typeof(payload->'all_day') is distinct from 'boolean' then raise exception 'Timezone, visibility and all-day choice required' using errcode='23514'; end if;
  if jsonb_typeof(payload->'occurrences') is distinct from 'array' or jsonb_array_length(payload->'occurrences') not between 1 and 104 then raise exception 'Bounded occurrence list required' using errcode='23514'; end if;
  if jsonb_typeof(payload->'recurrence') is distinct from 'object' or coalesce(payload->'recurrence'->>'frequency','') not in ('none','daily','weekly','monthly') or (payload->'recurrence'->>'count')::integer is distinct from jsonb_array_length(payload->'occurrences') then raise exception 'Recurrence metadata required' using errcode='23514'; end if;
  for item in select value from jsonb_array_elements(payload->'occurrences') loop
    begins:=(item->>'starts_at')::timestamptz;ends:=(item->>'ends_at')::timestamptz;
    if begins is null or ends is null or ends<=begins or ends-begins>interval '14 days' or begins<previous_end then raise exception 'Invalid or overlapping series interval' using errcode='23514'; end if;
    first_start:=coalesce(first_start,begins);
    if (payload->>'all_day')::boolean and ((begins at time zone (payload->>'timezone'))::time<>'00:00'::time or (ends at time zone (payload->>'timezone'))::time<>'00:00'::time) then raise exception 'All-day boundaries must be local midnight' using errcode='23514'; end if;
    if begins-first_start>interval '731 days' then raise exception 'Recurrence exceeds two years' using errcode='23514'; end if;
    previous_end:=ends;
  end loop;
end; $$;
create function public.save_calendar_draft(request_id uuid,target_club uuid,event_payload jsonb,base_event uuid default null,base_revision integer default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.calendar_drafts;
begin
  if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform public.validate_calendar_payload(event_payload);
  if base_event is not null and not exists(select 1 from public.calendar_events where club_id=target_club and id=base_event and revision=base_revision) then raise exception 'Event revision changed' using errcode='23514'; end if;
  select * into existing from public.calendar_drafts where id=request_id;
  if found then
    if existing.club_id=target_club and existing.created_by=auth.uid() and existing.payload=event_payload and existing.base_event_id is not distinct from base_event and existing.expected_revision=base_revision then return existing.id; end if;
    raise exception 'Request ID already used' using errcode='23514'; end if;
  insert into public.calendar_drafts(id,club_id,base_event_id,expected_revision,payload,created_by) values(request_id,target_club,base_event,base_revision,event_payload,auth.uid());return request_id;
end; $$;
create function public.calendar_draft_conflicts(target_draft uuid)
returns table(occurrence_id uuid,title text,starts_at timestamptz,ends_at timestamptz) language sql stable set search_path='' as $$
  select distinct o.id,e.title,o.starts_at,o.ends_at from public.calendar_drafts d cross join lateral jsonb_array_elements(d.payload->'occurrences') x
    join public.calendar_occurrences o on o.club_id=d.club_id and o.status='scheduled' and o.starts_at<(x->>'ends_at')::timestamptz and o.ends_at>(x->>'starts_at')::timestamptz
    join public.calendar_events e on e.club_id=o.club_id and e.id=o.event_id and e.status='published'
    where d.id=target_draft and o.event_id is distinct from d.base_event_id order by o.starts_at;
$$;
create function public.publish_calendar_draft(target_draft uuid,conflicts_reviewed boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.calendar_drafts;event_id uuid;item jsonb;idx integer:=0;e public.calendar_events;has_conflict boolean;
begin
  select * into d from public.calendar_drafts where id=target_draft;
  if not found or not public.can_manage_program(d.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=d.club_id for update;
  select * into d from public.calendar_drafts where id=target_draft for update;
  if d.status='published' then return d.published_event_id; end if;
  if d.status<>'draft' then raise exception 'Draft unavailable' using errcode='23514'; end if;
  perform public.validate_calendar_payload(d.payload);
  select exists(select 1 from public.calendar_occurrences o join public.calendar_events ce on ce.club_id=o.club_id and ce.id=o.event_id cross join lateral jsonb_array_elements(d.payload->'occurrences') x
    where o.club_id=d.club_id and o.event_id is distinct from d.base_event_id and o.status='scheduled' and ce.status='published' and o.starts_at<(x->>'ends_at')::timestamptz and o.ends_at>(x->>'starts_at')::timestamptz) into has_conflict;
  if has_conflict and conflicts_reviewed is distinct from true then raise exception 'Review calendar conflicts before publishing' using errcode='23514'; end if;
  if d.base_event_id is not null then
    select * into e from public.calendar_events where club_id=d.club_id and id=d.base_event_id for update;
    if e.revision<>d.expected_revision then raise exception 'Event revision changed' using errcode='23514'; end if;
    if (e.timezone is distinct from d.payload->>'timezone' or e.all_day is distinct from (d.payload->>'all_day')::boolean) and exists(select 1 from public.calendar_occurrences where club_id=d.club_id and calendar_occurrences.event_id=e.id and attendance_session_id is not null) then raise exception 'Attendance-linked event timezone and all-day choice are fixed' using errcode='23514'; end if;
    if exists(select 1 from public.calendar_occurrences o where o.club_id=d.club_id and o.event_id=e.id and o.attendance_session_id is not null and
      (not exists(select 1 from jsonb_array_elements(d.payload->'occurrences') with ordinality x(value,n) where n=o.sequence and (value->>'starts_at')::timestamptz=o.starts_at and (value->>'ends_at')::timestamptz=o.ends_at))) then raise exception 'Attendance-linked occurrences cannot be rescheduled or removed' using errcode='23514'; end if;
    event_id:=e.id;
    update public.calendar_events set title=d.payload->>'title',description=coalesce(d.payload->>'description',''),location=coalesce(d.payload->>'location',''),category=d.payload->>'category',organizer=coalesce(d.payload->>'organizer',''),timezone=d.payload->>'timezone',all_day=(d.payload->>'all_day')::boolean,visibility=d.payload->>'visibility',recurrence=d.payload->'recurrence',status='published',revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=e.id;
    update public.calendar_occurrences set status='cancelled' where club_id=d.club_id and calendar_occurrences.event_id=e.id;
  else
    insert into public.calendar_events(club_id,title,description,location,category,organizer,timezone,all_day,visibility,recurrence,created_by,updated_by)
      values(d.club_id,d.payload->>'title',coalesce(d.payload->>'description',''),coalesce(d.payload->>'location',''),d.payload->>'category',coalesce(d.payload->>'organizer',''),d.payload->>'timezone',(d.payload->>'all_day')::boolean,d.payload->>'visibility',d.payload->'recurrence',auth.uid(),auth.uid()) returning id into event_id;
  end if;
  for item in select value from jsonb_array_elements(d.payload->'occurrences') loop
    idx:=idx+1;
    insert into public.calendar_occurrences(club_id,event_id,sequence,starts_at,ends_at) values(d.club_id,event_id,idx,(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz)
      on conflict on constraint calendar_occurrences_event_id_sequence_key do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status='scheduled';
  end loop;
  update public.calendar_drafts set status='published',published_event_id=event_id where id=d.id;
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details) values(d.club_id,auth.uid(),'calendar_publish','calendar_events',event_id::text,jsonb_build_object('draft_id',d.id,'conflicts_reviewed',conflicts_reviewed,'source_kind',d.source_kind));
  return event_id;
end; $$;
create function public.cancel_calendar_event(target_event uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.calendar_events;
begin
  select * into e from public.calendar_events where id=target_event;
  if not found or not public.can_manage_program(e.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=e.club_id for update;
  select * into e from public.calendar_events where id=target_event for update;
  if e.revision<>expected_revision or e.status<>'published' then raise exception 'Event changed' using errcode='23514'; end if;
  update public.calendar_events set status='cancelled',revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=e.id;
  update public.calendar_occurrences set status='cancelled' where club_id=e.club_id and event_id=e.id;
end; $$;
create function public.discard_calendar_draft(target_draft uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.calendar_drafts;
begin
  select * into d from public.calendar_drafts where id=target_draft for update;
  if not found or not public.can_manage_program(d.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if d.status<>'draft' then raise exception 'Draft unavailable' using errcode='23514'; end if;
  update public.calendar_drafts set status='discarded' where id=d.id;
end; $$;
create function public.respond_event(target_occurrence uuid,target_participant uuid,answer text) returns void language plpgsql security definer set search_path='' as $$
declare o public.calendar_occurrences;e public.calendar_events;p public.tlt_participants;
begin
  select * into o from public.calendar_occurrences where id=target_occurrence for update;
  select * into e from public.calendar_events where id=o.event_id and club_id=o.club_id;
  select * into p from public.tlt_participants where id=target_participant and club_id=o.club_id for update;
  if not found or not public.can_access_participant(p.club_id,p.id) or (e.visibility='staff' and not public.is_club_staff(p.club_id)) then raise exception 'Not authorized' using errcode='42501'; end if;
  if o.status<>'scheduled' or e.status<>'published' or o.starts_at<=now() or p.consent_state<>'confirmed' or p.status not in ('pending','active') then raise exception 'RSVP unavailable' using errcode='23514'; end if;
  insert into public.event_rsvps(club_id,occurrence_id,participant_id,response,updated_by) values(o.club_id,o.id,p.id,answer,auth.uid()) on conflict(club_id,occurrence_id,participant_id) do update set response=excluded.response,updated_by=auth.uid(),updated_at=now();
end; $$;
create function public.link_event_attendance(target_occurrence uuid,target_season uuid,requires_attendance boolean default true,requires_uniform boolean default true,excused_as_absent boolean default false,uniform_basis text default 'present_only') returns uuid language plpgsql security definer set search_path='' as $$
declare o public.calendar_occurrences;e public.calendar_events;result uuid;
begin
  select * into o from public.calendar_occurrences where id=target_occurrence;
  if not found or not public.can_manage_program(o.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=o.club_id for update;
  select * into o from public.calendar_occurrences where id=target_occurrence for update;
  select * into e from public.calendar_events where club_id=o.club_id and id=o.event_id;
  if o.attendance_session_id is not null then return o.attendance_session_id; end if;
  if o.status<>'scheduled' or e.status<>'published' or o.starts_at>now() then raise exception 'Completed event required' using errcode='23514'; end if;
  result:=public.create_attendance_session(o.club_id,target_season,e.title,(o.starts_at at time zone (select timezone from public.clubs where id=o.club_id))::date,requires_attendance,requires_uniform,excused_as_absent,uniform_basis);
  update public.calendar_occurrences set attendance_session_id=result where id=o.id;return result;
end; $$;
revoke all on function public.validate_calendar_payload(jsonb),public.save_calendar_draft(uuid,uuid,jsonb,uuid,integer),public.calendar_draft_conflicts(uuid),public.publish_calendar_draft(uuid,boolean),public.cancel_calendar_event(uuid,integer),public.discard_calendar_draft(uuid),public.respond_event(uuid,uuid,text),public.link_event_attendance(uuid,uuid,boolean,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.save_calendar_draft(uuid,uuid,jsonb,uuid,integer),public.calendar_draft_conflicts(uuid),public.publish_calendar_draft(uuid,boolean),public.cancel_calendar_event(uuid,integer),public.discard_calendar_draft(uuid),public.respond_event(uuid,uuid,text),public.link_event_attendance(uuid,uuid,boolean,boolean,boolean,text) to authenticated;
create function public.log_calendar_export(target_club uuid,export_format text,target_occurrence uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if export_format='ics' then
    if not (public.is_club_staff(target_club) or public.has_club_role(target_club,array['participant']::public.club_role[])) then raise exception 'Not authorized' using errcode='42501'; end if;
  elsif export_format='roster_csv' then
    if not public.is_club_staff(target_club) or not exists(select 1 from public.calendar_occurrences where club_id=target_club and id=target_occurrence) then raise exception 'Not authorized' using errcode='42501'; end if;
  else raise exception 'Invalid format' using errcode='23514'; end if;
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details) values(target_club,auth.uid(),'calendar_export','calendar',coalesce(target_occurrence::text,target_club::text),jsonb_build_object('format',export_format));
end; $$;
revoke all on function public.log_calendar_export(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.log_calendar_export(uuid,text,uuid) to authenticated;
