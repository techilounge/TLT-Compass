create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  season_id uuid not null,
  title text not null check(length(trim(title)) between 1 and 160),
  held_on date not null,
  attendance_required boolean not null default true,
  uniform_required boolean not null default true,
  excused_counts_absent boolean not null default false,
  uniform_denominator text not null default 'present_only' check(uniform_denominator in ('present_only','all_required')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(club_id,id),
  foreign key(club_id,season_id) references public.seasons(club_id,id),
  unique(club_id,season_id,held_on,title)
);
create table public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  session_id uuid not null,
  participant_id uuid not null,
  attendance text not null check(attendance in ('present','absent','excused')),
  uniform_compliant boolean,
  status text not null default 'pending' check(status in ('pending','verified')),
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  foreign key(club_id,session_id) references public.attendance_sessions(club_id,id),
  foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  unique(club_id,session_id,participant_id),
  check((status='pending' and reviewed_by is null and reviewed_at is null) or (status='verified' and reviewed_by is not null and reviewed_at is not null))
);
create index attendance_entries_participant on public.attendance_entries(club_id,participant_id,status);
alter table public.attendance_sessions enable row level security;
alter table public.attendance_entries enable row level security;
create policy attendance_sessions_read on public.attendance_sessions for select to authenticated using(public.has_club_role(club_id,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[]));
create policy attendance_entries_read on public.attendance_entries for select to authenticated using(public.can_access_participant(club_id,participant_id));
revoke all on public.attendance_sessions,public.attendance_entries from public,anon,authenticated;
grant select on public.attendance_sessions,public.attendance_entries to authenticated;
grant all on public.attendance_sessions,public.attendance_entries to service_role;
create trigger audit_attendance_sessions after insert or update on public.attendance_sessions for each row execute function public.audit_change();
create trigger audit_attendance_entries after insert or update on public.attendance_entries for each row execute function public.audit_change();

create function public.create_attendance_session(target_club uuid,target_season uuid,session_title text,session_date date,requires_attendance boolean,requires_uniform boolean,excused_as_absent boolean,uniform_basis text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  if session_date>public.club_today(target_club) or not exists(select 1 from public.seasons where club_id=target_club and id=target_season and session_date between starts_on and ends_on) then
    raise exception 'Session must be within the season and not in the future' using errcode='23514'; end if;
  insert into public.attendance_sessions(club_id,season_id,title,held_on,attendance_required,uniform_required,excused_counts_absent,uniform_denominator,created_by)
    values(target_club,target_season,session_title,session_date,requires_attendance,requires_uniform,excused_as_absent,uniform_basis,auth.uid()) returning id into result;
  return result;
end;
$$;

create function public.record_attendance(target_session uuid,target_participant uuid,attendance_state text,uniform_ok boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.attendance_sessions; p public.tlt_participants; result uuid;
begin
  select * into s from public.attendance_sessions where id=target_session for update;
  if not found or not public.can_manage_program(s.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.tlt_participants where id=target_participant and club_id=s.club_id for update;
  if not found or p.season_id<>s.season_id or p.consent_state<>'confirmed' then raise exception 'Participant season and consent required' using errcode='23514'; end if;
  if attendance_state<>'present' and uniform_ok then raise exception 'Uniform compliance requires presence' using errcode='23514'; end if;
  if s.uniform_required and (attendance_state='present' or (s.uniform_denominator='all_required' and (attendance_state='absent' or (attendance_state='excused' and s.excused_counts_absent)))) and uniform_ok is null then
    raise exception 'Uniform assessment required' using errcode='23514'; end if;
  insert into public.attendance_entries(club_id,session_id,participant_id,attendance,uniform_compliant,recorded_by)
    values(s.club_id,s.id,p.id,attendance_state,uniform_ok,auth.uid())
    on conflict(club_id,session_id,participant_id) do update set attendance=excluded.attendance,uniform_compliant=excluded.uniform_compliant,
      recorded_by=auth.uid(),recorded_at=now(),status='pending',reviewed_by=null,reviewed_at=null
    returning id into result;
  return result;
end;
$$;

create function public.verify_attendance(target_entry uuid,expected_recorded_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare e public.attendance_entries; p public.tlt_participants;
begin
  select * into e from public.attendance_entries where id=target_entry for update;
  if not found or not public.has_club_role(e.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.tlt_participants where id=e.participant_id and club_id=e.club_id for update;
  if p.profile_id=auth.uid() then raise exception 'No self-review' using errcode='42501'; end if;
  if p.consent_state<>'confirmed' or e.status<>'pending' or e.recorded_at is distinct from expected_recorded_at then
    raise exception 'Record changed, already verified, or consent withdrawn' using errcode='23514'; end if;
  update public.attendance_entries set status='verified',reviewed_by=auth.uid(),reviewed_at=now() where id=e.id;
end;
$$;

create function public.attendance_summary(target_participant uuid)
returns table(reviewed_entries bigint,pending_entries bigint,attended bigint,attendance_denominator bigint,uniform_compliant bigint,uniform_denominator bigint)
language sql stable set search_path='' as $$
  select count(*) filter(where e.status='verified'),count(*) filter(where e.status='pending'),
    count(*) filter(where e.status='verified' and s.attendance_required and e.attendance='present'),
    count(*) filter(where e.status='verified' and s.attendance_required and (e.attendance<>'excused' or s.excused_counts_absent)),
    count(*) filter(where e.status='verified' and s.uniform_required and e.uniform_compliant and (e.attendance='present' or (s.uniform_denominator='all_required' and (e.attendance='absent' or (e.attendance='excused' and s.excused_counts_absent))))),
    count(*) filter(where e.status='verified' and s.uniform_required and (e.attendance='present' or (s.uniform_denominator='all_required' and (e.attendance='absent' or (e.attendance='excused' and s.excused_counts_absent)))))
  from public.attendance_entries e join public.attendance_sessions s on s.club_id=e.club_id and s.id=e.session_id
  where e.participant_id=target_participant and exists(select 1 from public.tlt_participants p where p.id=target_participant and p.club_id=e.club_id);
$$;
revoke all on function public.create_attendance_session(uuid,uuid,text,date,boolean,boolean,boolean,text),public.record_attendance(uuid,uuid,text,boolean),public.verify_attendance(uuid,timestamptz),public.attendance_summary(uuid) from public,anon,authenticated;
grant execute on function public.create_attendance_session(uuid,uuid,text,date,boolean,boolean,boolean,text),public.record_attendance(uuid,uuid,text,boolean),public.verify_attendance(uuid,timestamptz),public.attendance_summary(uuid) to authenticated;

-- Preserve every recorded/reviewed version even when a correction resets review.
create table public.attendance_entry_versions (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  entry_id uuid not null references public.attendance_entries(id), participant_id uuid not null,
  attendance text not null,uniform_compliant boolean,status text not null,
  recorded_by uuid not null references public.profiles(id),recorded_at timestamptz not null,
  reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
  captured_at timestamptz not null default now(),
  foreign key(club_id,participant_id) references public.tlt_participants(club_id,id)
);
alter table public.attendance_entry_versions enable row level security;
create policy attendance_versions_read on public.attendance_entry_versions for select to authenticated using(public.can_access_participant(club_id,participant_id));
revoke all on public.attendance_entry_versions from public,anon,authenticated;
grant select on public.attendance_entry_versions to authenticated;
grant all on public.attendance_entry_versions to service_role;
create function public.capture_attendance_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.attendance_entry_versions(club_id,entry_id,participant_id,attendance,uniform_compliant,status,recorded_by,recorded_at,reviewed_by,reviewed_at)
    values(new.club_id,new.id,new.participant_id,new.attendance,new.uniform_compliant,new.status,new.recorded_by,new.recorded_at,new.reviewed_by,new.reviewed_at);
  return new;
end;
$$;
revoke all on function public.capture_attendance_version() from public,anon,authenticated;
create trigger preserve_attendance_version after insert or update on public.attendance_entries for each row execute function public.capture_attendance_version();
create trigger immutable_attendance_versions before update or delete or truncate on public.attendance_entry_versions for each statement execute function public.reject_audit_mutation();
