create table public.training_hours (
  id uuid primary key,
  club_id uuid not null references public.clubs(id),
  participant_id uuid not null,
  category text not null check(category in ('workshop','lab')),
  department_code text not null check(department_code in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')),
  starts_at timestamptz not null, ends_at timestamptz not null,
  duration_minutes integer generated always as (floor(extract(epoch from (ends_at-starts_at))/60)::integer) stored,
  evidence text not null check(length(trim(evidence)) between 1 and 5000),
  status text not null default 'pending' check(status in ('pending','verified','rejected')),
  submitted_by uuid not null references public.profiles(id), submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  feedback text check(length(feedback)<=2000),
  foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  check(ends_at>starts_at and ends_at-starts_at>=interval '1 minute'),
  check((status='pending' and reviewed_by is null and reviewed_at is null) or (status in ('verified','rejected') and reviewed_by is not null and reviewed_at is not null and feedback is not null))
);
create index hours_participant on public.training_hours(club_id,participant_id,status,starts_at);
alter table public.training_hours enable row level security;
create policy hours_read on public.training_hours for select to authenticated using(public.can_access_participant(club_id,participant_id));
revoke all on public.training_hours from public,anon,authenticated;
grant select on public.training_hours to authenticated;
grant all on public.training_hours to service_role;
create trigger audit_hours after insert or update on public.training_hours for each row execute function public.audit_change();
create function public.freeze_reviewed_hours() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status<>'pending' then raise exception 'Reviewed hours are immutable' using errcode='23514'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger immutable_reviewed_hours before update or delete on public.training_hours for each row execute function public.freeze_reviewed_hours();

create function public.submit_training_hours(request_id uuid,target_participant uuid,hour_category text,department text,starts timestamptz,ends timestamptz,hour_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; season public.seasons; tz text; existing public.training_hours;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_access_participant(p.club_id,p.id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p.consent_state<>'confirmed' or p.status not in ('active','pending') then raise exception 'Participant consent and enrollment required' using errcode='23514'; end if;
  if p.profile_id is distinct from auth.uid() and not (public.can_manage_program(p.club_id) or public.is_assigned_mentor(p.club_id,p.id,department)) then raise exception 'Department assignment required' using errcode='42501'; end if;
  select * into existing from public.training_hours where id=request_id;
  if found then
    if existing.participant_id=p.id and existing.submitted_by=auth.uid() and existing.category=hour_category and existing.department_code=department and existing.starts_at=starts and existing.ends_at=ends and existing.evidence=hour_evidence then return existing.id; end if;
    raise exception 'Request ID already used' using errcode='23514';
  end if;
  select * into season from public.seasons where club_id=p.club_id and id=p.season_id;
  select timezone into tz from public.clubs where id=p.club_id;
  if starts is null or ends is null or ends>now() or starts>=ends or (starts at time zone tz)::date<season.starts_on or ((ends-interval '1 microsecond') at time zone tz)::date>season.ends_on then
    raise exception 'Hours must be completed within participant season' using errcode='23514'; end if;
  if exists(select 1 from public.training_hours h where h.club_id=p.club_id and h.participant_id=p.id and h.status<>'rejected' and h.starts_at<ends and h.ends_at>starts) then
    raise exception 'Hours overlap an existing pending or verified entry' using errcode='23514'; end if;
  insert into public.training_hours(id,club_id,participant_id,category,department_code,starts_at,ends_at,evidence,submitted_by)
    values(request_id,p.club_id,p.id,hour_category,department,starts,ends,hour_evidence,auth.uid());
  return request_id;
end;
$$;

create function public.review_training_hours(target_hours uuid,decision text,review_feedback text)
returns void language plpgsql security definer set search_path='' as $$
declare h public.training_hours; p public.tlt_participants;
begin
  -- Match submission's participant-first lock order to serialize overlap checks.
  select p0.* into p from public.tlt_participants p0 join public.training_hours h0 on h0.club_id=p0.club_id and h0.participant_id=p0.id where h0.id=target_hours for update of p0;
  select * into h from public.training_hours where id=target_hours for update;
  if not found or not (public.can_manage_program(h.club_id) or public.is_assigned_mentor(h.club_id,h.participant_id,h.department_code)) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p.profile_id=auth.uid() or h.submitted_by=auth.uid() then raise exception 'No self-review' using errcode='42501'; end if;
  if p.consent_state<>'confirmed' or h.status<>'pending' or decision not in ('verified','rejected') or length(trim(review_feedback)) not between 1 and 2000 then raise exception 'Invalid review, consent, or entry state' using errcode='23514'; end if;
  update public.training_hours set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),feedback=review_feedback where id=h.id;
end;
$$;
create function public.training_hours_summary(target_participant uuid)
returns table(workshop_minutes bigint,lab_minutes bigint,pending_minutes bigint)
language sql stable set search_path='' as $$
  select coalesce(sum(duration_minutes) filter(where category='workshop' and status='verified'),0),
    coalesce(sum(duration_minutes) filter(where category='lab' and status='verified'),0),
    coalesce(sum(duration_minutes) filter(where status='pending'),0)
  from public.training_hours where participant_id=target_participant;
$$;
revoke all on function public.freeze_reviewed_hours(),public.submit_training_hours(uuid,uuid,text,text,timestamptz,timestamptz,text),public.review_training_hours(uuid,text,text),public.training_hours_summary(uuid) from public,anon,authenticated;
grant execute on function public.submit_training_hours(uuid,uuid,text,text,timestamptz,timestamptz,text),public.review_training_hours(uuid,text,text),public.training_hours_summary(uuid) to authenticated;
