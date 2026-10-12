-- Final guards for version history, tenant references and mentor scope.
alter table public.task_reviews add constraint reviews_club_id_unique unique(club_id,id);
alter table public.participant_requirements add constraint completion_review_scope foreign key(club_id,review_id) references public.task_reviews(club_id,id);
create unique index one_requirement_task on public.tasks(club_id,participant_id,requirement_id) where status<>'cancelled';
create function public.validate_club_timezone() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Valid IANA timezone required' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger valid_timezone before insert or update of timezone on public.clubs for each row execute function public.validate_club_timezone();
create function public.club_today(target_club uuid) returns date language sql stable security definer set search_path='' as $$
  select (now() at time zone timezone)::date from public.clubs where id=target_club;
$$;
create function public.is_assigned_mentor(target_club uuid,target_participant uuid,department text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.mentor_assignments m where m.club_id=target_club and m.participant_id=target_participant
    and m.mentor_profile_id=auth.uid() and m.state='active' and m.starts_on<=public.club_today(target_club)
    and (m.ends_on is null or m.ends_on>=public.club_today(target_club))
    and (department is null or m.assignment_type='primary' or m.department_code=department)
    and public.has_club_role(target_club,case when m.assignment_type='primary'
      then array['primary_mentor','director','coordinator']::public.club_role[]
      else array['operational_mentor','director','coordinator']::public.club_role[] end)
  );
$$;
create or replace function public.can_access_participant(target_club uuid,target_participant uuid,staff_only boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tlt_participants p where p.club_id=target_club and p.id=target_participant and (
    public.can_manage_program(target_club) or public.is_assigned_mentor(target_club,target_participant)
    or (not staff_only and p.profile_id=auth.uid() and public.has_club_role(target_club,array['participant']::public.club_role[]))
  ));
$$;
create or replace function public.can_review_task(target_task uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.tlt_participants p on p.club_id=t.club_id and p.id=t.participant_id
    join public.program_requirements r on r.club_id=t.club_id and r.id=t.requirement_id
    where t.id=target_task and p.profile_id is distinct from auth.uid()
    and (public.can_manage_program(t.club_id) or public.is_assigned_mentor(t.club_id,t.participant_id,r.department_code)));
$$;
create or replace function public.admit_participant(target_participant uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; rule public.program_rule_sets; today date;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.has_club_role(p.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  today:=public.club_today(p.club_id);
  select r.* into rule from public.program_rule_sets r join public.seasons s on s.club_id=r.club_id and s.rule_set_id=r.id where s.id=p.season_id and s.club_id=p.club_id;
  if p.status<>'pending' or rule.status<>'approved' or p.consent_state<>'confirmed' or not p.registration_confirmed
    or p.grade_level not between rule.minimum_grade and rule.maximum_grade
    or (rule.require_prior_achievement and not p.prior_achievement_confirmed)
    or p.recommendations_received<rule.recommendation_count or p.recent_attendance is null or p.recent_attendance<rule.minimum_attendance
    or p.probation_started_on is null or today-p.probation_started_on<rule.probation_days
    or not exists(select 1 from public.mentor_assignments m join public.staff_eligibility e on e.club_id=m.club_id and e.profile_id=m.mentor_profile_id
      join public.club_memberships cm on cm.club_id=m.club_id and cm.profile_id=m.mentor_profile_id
      where m.club_id=p.club_id and m.participant_id=p.id and m.assignment_type='primary' and m.state='active'
      and m.starts_on<=today and (m.ends_on is null or m.ends_on>=today)
      and e.eligible and cm.status='active' and cm.role in ('director','coordinator','primary_mentor'))
  then raise exception 'Onboarding prerequisites incomplete or rules unapproved' using errcode='23514'; end if;
  update public.tlt_participants set status='active',admitted_by=auth.uid(),admitted_at=now() where id=p.id;
end;
$$;
create or replace function public.create_task(target_participant uuid,target_requirement uuid,task_title text,task_instructions text,task_due_on date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; r public.program_requirements; result uuid;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_access_participant(p.club_id,p.id,true) then raise exception 'Not authorized' using errcode='42501'; end if;
  select req.* into r from public.program_requirements req join public.program_rule_sets rs on rs.club_id=req.club_id and rs.id=req.rule_set_id
  join public.seasons s on s.club_id=rs.club_id and s.rule_set_id=rs.id
  where req.id=target_requirement and req.club_id=p.club_id and s.id=p.season_id and rs.status='approved' and req.level=p.current_level;
  if not found or p.status<>'active' or p.consent_state<>'confirmed' then raise exception 'Active participant and approved current-level requirement required' using errcode='23514'; end if;
  if not public.can_manage_program(p.club_id) and not public.is_assigned_mentor(p.club_id,p.id,r.department_code) then raise exception 'Department assignment required' using errcode='42501'; end if;
  insert into public.tasks(club_id,participant_id,requirement_id,rule_set_id,title,instructions,due_on,created_by)
  values(p.club_id,p.id,r.id,r.rule_set_id,task_title,task_instructions,task_due_on,auth.uid()) returning id into result;
  return result;
end;
$$;
create or replace function public.submit_task(target_task uuid,evidence text,reflection_text text,activity_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tasks; p public.tlt_participants; result uuid; next_version integer;
begin
  select * into t from public.tasks where id=target_task for update;
  select * into p from public.tlt_participants where id=t.participant_id and club_id=t.club_id for update;
  if t.id is null or p.profile_id is distinct from auth.uid() or not public.has_club_role(t.club_id,array['participant']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if t.status not in ('assigned','in_progress','changes_requested') or p.status<>'active' or p.consent_state<>'confirmed' or activity_date>public.club_today(t.club_id) then raise exception 'Task cannot be submitted' using errcode='23514'; end if;
  select coalesce(max(version_no),0)+1 into next_version from public.task_submissions where task_id=t.id;
  insert into public.task_submissions(club_id,task_id,version_no,submitted_by,evidence_text,reflection,activity_on)
  values(t.club_id,t.id,next_version,auth.uid(),evidence,reflection_text,activity_date) returning id into result;
  update public.tasks set status='submitted' where id=t.id;
  return result;
end;
$$;
revoke all on function public.validate_club_timezone(),public.club_today(uuid),public.is_assigned_mentor(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.is_assigned_mentor(uuid,uuid,text) to authenticated;
