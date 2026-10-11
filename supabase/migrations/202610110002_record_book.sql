-- Phase 1: versioned curriculum and the first record-book workflow.
create table public.program_rule_sets (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  version text not null check(length(trim(version)) between 1 and 80),
  source_title text not null check(length(trim(source_title)) between 1 and 200),
  source_reference text not null default '', status text not null default 'draft' check(status in ('draft','approved','retired')),
  minimum_grade integer not null default 9 check(minimum_grade between 1 and 12),
  maximum_grade integer not null default 12 check(maximum_grade between minimum_grade and 12),
  minimum_attendance numeric not null default 80 check(minimum_attendance between 0 and 100),
  recommendation_count integer not null default 3 check(recommendation_count between 0 and 10),
  probation_days integer not null default 60 check(probation_days between 0 and 365),
  require_prior_achievement boolean not null default true,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  unique(club_id,id), unique(club_id,version),
  check(status='draft' or (approved_by is not null and approved_at is not null and length(trim(source_reference))>0))
);
create table public.seasons (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  name text not null check(length(trim(name)) between 1 and 120), starts_on date not null, ends_on date not null,
  schedule_months integer not null default 9 check(schedule_months in (9,12)),
  rule_set_id uuid not null, unique(club_id,id), check(ends_on>=starts_on),
  foreign key(club_id,rule_set_id) references public.program_rule_sets(club_id,id)
);
create table public.tlt_participants (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), season_id uuid not null,
  profile_id uuid references public.profiles(id), public_alias text not null check(length(trim(public_alias)) between 1 and 80),
  grade_level integer not null check(grade_level between 1 and 12), current_level integer not null default 1 check(current_level between 1 and 4),
  consent_state text not null default 'pending' check(consent_state in ('pending','confirmed','withdrawn')),
  registration_confirmed boolean not null default false, prior_achievement_confirmed boolean not null default false,
  recommendations_received integer not null default 0 check(recommendations_received between 0 and 10),
  recent_attendance numeric check(recent_attendance between 0 and 100), probation_started_on date,
  status text not null default 'pending' check(status in ('pending','active','paused','withdrawn')),
  admitted_by uuid references public.profiles(id), admitted_at timestamptz,
  unique(club_id,id), unique(club_id,season_id,profile_id),
  foreign key(club_id,season_id) references public.seasons(club_id,id),
  check(status<>'active' or (admitted_by is not null and admitted_at is not null))
);
create index participants_club_season_status on public.tlt_participants(club_id,season_id,status);
create table public.mentor_assignments (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), participant_id uuid not null,
  mentor_profile_id uuid not null references public.profiles(id), assignment_type text not null check(assignment_type in ('primary','operational')),
  department_code text check(department_code in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')),
  starts_on date not null, ends_on date, unique(club_id,id), check(ends_on is null or ends_on>=starts_on),
  foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  check((assignment_type='primary' and department_code is null) or (assignment_type='operational' and department_code is not null))
);
create index mentors_active on public.mentor_assignments(club_id,mentor_profile_id,participant_id);
create table public.program_requirements (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), rule_set_id uuid not null,
  level integer not null check(level between 1 and 4), department_code text not null check(department_code in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')),
  requirement_type text not null check(requirement_type in ('required','optional')), description text not null check(length(trim(description)) between 1 and 2000),
  source_page text not null check(length(trim(source_page)) between 1 and 80), source_section text not null check(length(trim(source_section)) between 1 and 200),
  unique(club_id,id), unique(club_id,rule_set_id,id), foreign key(club_id,rule_set_id) references public.program_rule_sets(club_id,id)
);
create table public.rotations (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), participant_id uuid not null,
  department_code text not null check(department_code in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')),
  mentor_assignment_id uuid not null, starts_on date not null, ends_on date not null,
  status text not null default 'active' check(status in ('active','reviewed','cancelled')), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  unique(club_id,id), foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  foreign key(club_id,mentor_assignment_id) references public.mentor_assignments(club_id,id), check(ends_on>=starts_on),
  check(status<>'reviewed' or (reviewed_by is not null and reviewed_at is not null))
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), participant_id uuid not null,
  requirement_id uuid not null, rule_set_id uuid not null, rotation_id uuid,
  title text not null check(length(trim(title)) between 1 and 160), instructions text not null default '' check(length(instructions)<=5000), due_on date,
  status text not null default 'assigned' check(status in ('assigned','in_progress','submitted','changes_requested','verified','closed','cancelled')),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  unique(club_id,id), foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  foreign key(club_id,rule_set_id,requirement_id) references public.program_requirements(club_id,rule_set_id,id),
  foreign key(club_id,rotation_id) references public.rotations(club_id,id)
);
create index tasks_by_participant on public.tasks(club_id,participant_id,status);
create table public.task_submissions (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), task_id uuid not null,
  version_no integer not null check(version_no>0), submitted_by uuid not null references public.profiles(id),
  evidence_text text not null check(length(trim(evidence_text)) between 1 and 10000), reflection text not null check(length(trim(reflection)) between 1 and 5000),
  activity_on date not null, submitted_at timestamptz not null default now(), unique(club_id,id), unique(task_id,version_no),
  foreign key(club_id,task_id) references public.tasks(club_id,id)
);
create table public.task_reviews (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), submission_id uuid not null,
  reviewer_id uuid not null references public.profiles(id), decision text not null check(decision in ('verified','changes_requested')),
  feedback text not null check(length(trim(feedback)) between 1 and 5000), reviewed_at timestamptz not null default now(),
  unique(submission_id), foreign key(club_id,submission_id) references public.task_submissions(club_id,id)
);
create table public.participant_requirements (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), participant_id uuid not null,
  requirement_id uuid not null, rule_set_id uuid not null, task_id uuid not null, review_id uuid not null references public.task_reviews(id),
  reviewed_by uuid not null references public.profiles(id), completed_at timestamptz not null default now(),
  unique(club_id,participant_id,requirement_id), foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  foreign key(club_id,rule_set_id,requirement_id) references public.program_requirements(club_id,rule_set_id,id),
  foreign key(club_id,task_id) references public.tasks(club_id,id)
);

create function public.can_manage_program(target_club uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.has_club_role(target_club,array['director','coordinator']::public.club_role[]);
$$;
create function public.can_access_participant(target_club uuid,target_participant uuid,staff_only boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tlt_participants p where p.club_id=target_club and p.id=target_participant and (
    public.can_manage_program(target_club)
    or (not staff_only and p.profile_id=auth.uid() and public.has_club_role(target_club,array['participant']::public.club_role[]))
    or (public.is_club_staff(target_club) and exists(select 1 from public.mentor_assignments m
      where m.club_id=target_club and m.participant_id=p.id and m.mentor_profile_id=auth.uid()
      and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)))
  ));
$$;
create function public.can_review_task(target_task uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.tlt_participants p on p.club_id=t.club_id and p.id=t.participant_id
    join public.program_requirements r on r.club_id=t.club_id and r.id=t.requirement_id
    where t.id=target_task and p.profile_id is distinct from auth.uid() and (
      public.can_manage_program(t.club_id) or (public.is_club_staff(t.club_id) and exists (
        select 1 from public.mentor_assignments m where m.club_id=t.club_id and m.participant_id=t.participant_id
        and m.mentor_profile_id=auth.uid() and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)
        and (m.assignment_type='primary' or m.department_code=r.department_code)
      ))
    ));
$$;

create function public.freeze_rule_version() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status<>'draft' and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
    raise exception 'Create a new rule version instead of changing approved history' using errcode='23514';
  end if;
  if old.status<>'draft' and new.status<>'retired' then raise exception 'Rule version is frozen' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger freeze_rules before update on public.program_rule_sets for each row execute function public.freeze_rule_version();
create function public.freeze_requirement() returns trigger language plpgsql security definer set search_path='' as $$
declare rule_id uuid; target_club uuid;
begin
  rule_id:=case when tg_op='DELETE' then old.rule_set_id else new.rule_set_id end;
  target_club:=case when tg_op='DELETE' then old.club_id else new.club_id end;
  if tg_op='UPDATE' and (new.rule_set_id<>old.rule_set_id or new.club_id<>old.club_id) then raise exception 'Requirement scope is immutable' using errcode='23514'; end if;
  perform 1 from public.program_rule_sets where id=rule_id and club_id=target_club and status='draft' for update;
  if not found then raise exception 'Approved requirements are immutable' using errcode='23514'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger freeze_requirements before insert or update or delete on public.program_requirements for each row execute function public.freeze_requirement();
create function public.approve_rule_version(target_rule uuid,confirmed_reference text) returns void language plpgsql security definer set search_path='' as $$
declare rule public.program_rule_sets;
begin
  select * into rule from public.program_rule_sets where id=target_rule for update;
  if not found or not public.has_club_role(rule.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if rule.status<>'draft' or length(trim(confirmed_reference)) not between 1 and 2000 then raise exception 'Draft and confirmed source reference required' using errcode='23514'; end if;
  if not exists(select 1 from public.program_requirements where rule_set_id=target_rule) then raise exception 'Add documented requirements before approval' using errcode='23514'; end if;
  update public.program_rule_sets set status='approved',source_reference=confirmed_reference,approved_by=auth.uid(),approved_at=now() where id=target_rule;
end;
$$;
create function public.assign_mentor(target_participant uuid,target_mentor uuid,kind text,department text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; result uuid; expected_role public.club_role;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_manage_program(p.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if kind not in ('primary','operational') then raise exception 'Invalid assignment type' using errcode='23514'; end if;
  expected_role:=case when kind='primary' then 'primary_mentor'::public.club_role else 'operational_mentor'::public.club_role end;
  if p.profile_id=target_mentor or not exists(select 1 from public.club_memberships m join public.staff_eligibility e using(club_id,profile_id)
    where m.club_id=p.club_id and m.profile_id=target_mentor and m.role in (expected_role,'director','coordinator') and m.status='active' and e.eligible)
  then raise exception 'Eligible adult mentor in this club required' using errcode='42501'; end if;
  -- Keep primary assignment singular. The recommended three-teen load is surfaced by the UI, not a universal hard cap.
  if kind='primary' then update public.mentor_assignments set ends_on=current_date-1 where club_id=p.club_id and participant_id=p.id and assignment_type='primary' and ends_on is null and starts_on<current_date;
    delete from public.mentor_assignments where club_id=p.club_id and participant_id=p.id and assignment_type='primary' and ends_on is null and starts_on=current_date;
  end if;
  insert into public.mentor_assignments(club_id,participant_id,mentor_profile_id,assignment_type,department_code,starts_on)
  values(p.club_id,p.id,target_mentor,kind,department,current_date) returning id into result;
  return result;
end;
$$;
create function public.admit_participant(target_participant uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; rule public.program_rule_sets;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.has_club_role(p.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  select r.* into rule from public.program_rule_sets r join public.seasons s on s.club_id=r.club_id and s.rule_set_id=r.id where s.id=p.season_id and s.club_id=p.club_id;
  if p.status<>'pending' or rule.status<>'approved' or p.consent_state<>'confirmed' or not p.registration_confirmed
    or p.grade_level not between rule.minimum_grade and rule.maximum_grade
    or (rule.require_prior_achievement and not p.prior_achievement_confirmed)
    or p.recommendations_received<rule.recommendation_count or p.recent_attendance is null or p.recent_attendance<rule.minimum_attendance
    or p.probation_started_on is null or current_date-p.probation_started_on<rule.probation_days
    or not exists(select 1 from public.mentor_assignments m join public.staff_eligibility e on e.club_id=m.club_id and e.profile_id=m.mentor_profile_id
      join public.club_memberships cm on cm.club_id=m.club_id and cm.profile_id=m.mentor_profile_id
      where m.club_id=p.club_id and m.participant_id=p.id and m.assignment_type='primary' and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)
      and e.eligible and cm.status='active' and cm.role in ('director','coordinator','primary_mentor'))
  then raise exception 'Onboarding prerequisites incomplete or rules unapproved' using errcode='23514'; end if;
  update public.tlt_participants set status='active',admitted_by=auth.uid(),admitted_at=now() where id=p.id;
end;
$$;
create function public.create_task(target_participant uuid,target_requirement uuid,task_title text,task_instructions text,task_due_on date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; r public.program_requirements; result uuid;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_access_participant(p.club_id,p.id,true) then raise exception 'Not authorized' using errcode='42501'; end if;
  select req.* into r from public.program_requirements req join public.program_rule_sets rs on rs.club_id=req.club_id and rs.id=req.rule_set_id
  join public.seasons s on s.club_id=rs.club_id and s.rule_set_id=rs.id
  where req.id=target_requirement and req.club_id=p.club_id and s.id=p.season_id and rs.status='approved' and req.level=p.current_level;
  if not found or p.status<>'active' or p.consent_state<>'confirmed' then raise exception 'Active participant and approved current-level requirement required' using errcode='23514'; end if;
  if not public.can_manage_program(p.club_id) and not exists(select 1 from public.mentor_assignments m
    where m.club_id=p.club_id and m.participant_id=p.id and m.mentor_profile_id=auth.uid()
    and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)
    and (m.assignment_type='primary' or m.department_code=r.department_code)) then raise exception 'Department assignment required' using errcode='42501'; end if;
  insert into public.tasks(club_id,participant_id,requirement_id,rule_set_id,title,instructions,due_on,created_by)
  values(p.club_id,p.id,r.id,r.rule_set_id,task_title,task_instructions,task_due_on,auth.uid()) returning id into result;
  return result;
end;
$$;
create function public.submit_task(target_task uuid,evidence text,reflection_text text,activity_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tasks; p public.tlt_participants; result uuid; next_version integer;
begin
  select * into t from public.tasks where id=target_task for update;
  select * into p from public.tlt_participants where id=t.participant_id and club_id=t.club_id for update;
  if t.id is null or p.profile_id is distinct from auth.uid() or not public.has_club_role(t.club_id,array['participant']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if t.status not in ('assigned','in_progress','changes_requested') or p.status<>'active' or p.consent_state<>'confirmed' or activity_date>current_date then raise exception 'Task cannot be submitted' using errcode='23514'; end if;
  select coalesce(max(version_no),0)+1 into next_version from public.task_submissions where task_id=t.id;
  insert into public.task_submissions(club_id,task_id,version_no,submitted_by,evidence_text,reflection,activity_on)
  values(t.club_id,t.id,next_version,auth.uid(),evidence,reflection_text,activity_date) returning id into result;
  update public.tasks set status='submitted' where id=t.id;
  return result;
end;
$$;
create function public.review_submission(target_submission uuid,review_decision text,review_feedback text) returns uuid language plpgsql security definer set search_path='' as $$
declare sub public.task_submissions; t public.tasks; result uuid; p public.tlt_participants;
begin
  select * into sub from public.task_submissions where id=target_submission;
  select * into t from public.tasks where id=sub.task_id for update;
  if t.id is null or not public.can_review_task(t.id) or sub.submitted_by=auth.uid() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.tlt_participants where id=t.participant_id and club_id=t.club_id for update;
  if t.status<>'submitted' or sub.version_no<>(select max(version_no) from public.task_submissions where task_id=t.id)
    or p.status<>'active' or p.consent_state<>'confirmed' or review_decision not in ('verified','changes_requested') then raise exception 'Submission cannot be reviewed' using errcode='23514'; end if;
  insert into public.task_reviews(club_id,submission_id,reviewer_id,decision,feedback)
  values(t.club_id,sub.id,auth.uid(),review_decision,review_feedback) returning id into result;
  update public.tasks set status=review_decision where id=t.id;
  if review_decision='verified' then
    insert into public.participant_requirements(club_id,participant_id,requirement_id,rule_set_id,task_id,review_id,reviewed_by)
    values(t.club_id,t.participant_id,t.requirement_id,t.rule_set_id,t.id,result,auth.uid());
  end if;
  return result;
end;
$$;

-- RLS on every table. Direct workflow writes are denied; transactional functions enforce transitions.
alter table public.program_rule_sets enable row level security;
alter table public.seasons enable row level security;
alter table public.tlt_participants enable row level security;
alter table public.mentor_assignments enable row level security;
alter table public.program_requirements enable row level security;
alter table public.rotations enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.task_reviews enable row level security;
alter table public.participant_requirements enable row level security;
create policy rules_read on public.program_rule_sets for select to authenticated using(public.has_club_role(club_id,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[]));
create policy rules_insert on public.program_rule_sets for insert to authenticated with check(public.can_manage_program(club_id) and status='draft' and approved_by is null and approved_at is null);
create policy seasons_read on public.seasons for select to authenticated using(public.has_club_role(club_id,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[]));
create policy seasons_insert on public.seasons for insert to authenticated with check(public.can_manage_program(club_id));
create policy participants_read on public.tlt_participants for select to authenticated using(public.can_access_participant(club_id,id));
create policy participants_insert on public.tlt_participants for insert to authenticated with check(public.can_manage_program(club_id) and status='pending' and admitted_by is null and admitted_at is null and current_level=1);
create policy participants_update on public.tlt_participants for update to authenticated using(public.can_manage_program(club_id)) with check(public.can_manage_program(club_id));
create policy mentors_read on public.mentor_assignments for select to authenticated using(public.can_access_participant(club_id,participant_id));
create policy requirements_read on public.program_requirements for select to authenticated using(public.has_club_role(club_id,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[]));
create policy requirements_insert on public.program_requirements for insert to authenticated with check(public.can_manage_program(club_id));
create policy rotations_read on public.rotations for select to authenticated using(public.can_access_participant(club_id,participant_id));
create policy tasks_read on public.tasks for select to authenticated using(public.can_access_participant(club_id,participant_id));
create policy submissions_read on public.task_submissions for select to authenticated using(exists(select 1 from public.tasks t where t.club_id=task_submissions.club_id and t.id=task_submissions.task_id and public.can_access_participant(t.club_id,t.participant_id)));
create policy reviews_read on public.task_reviews for select to authenticated using(exists(select 1 from public.task_submissions s join public.tasks t on t.club_id=s.club_id and t.id=s.task_id where s.club_id=task_reviews.club_id and s.id=task_reviews.submission_id and public.can_access_participant(t.club_id,t.participant_id)));
create policy completion_read on public.participant_requirements for select to authenticated using(public.can_access_participant(club_id,participant_id));

revoke all on public.program_rule_sets,public.seasons,public.tlt_participants,public.mentor_assignments,public.program_requirements,public.rotations,public.tasks,public.task_submissions,public.task_reviews,public.participant_requirements from anon,authenticated;
grant select on public.program_rule_sets,public.seasons,public.tlt_participants,public.mentor_assignments,public.program_requirements,public.rotations,public.tasks,public.task_submissions,public.task_reviews,public.participant_requirements to authenticated;
grant insert(club_id,version,source_title,minimum_grade,maximum_grade,minimum_attendance,recommendation_count,probation_days,require_prior_achievement) on public.program_rule_sets to authenticated;
grant insert(club_id,name,starts_on,ends_on,schedule_months,rule_set_id) on public.seasons to authenticated;
grant insert(club_id,season_id,profile_id,public_alias,grade_level,consent_state,registration_confirmed,prior_achievement_confirmed,recommendations_received,recent_attendance,probation_started_on) on public.tlt_participants to authenticated;
grant update(public_alias,grade_level,consent_state,registration_confirmed,prior_achievement_confirmed,recommendations_received,recent_attendance,probation_started_on) on public.tlt_participants to authenticated;
grant insert(club_id,rule_set_id,level,department_code,requirement_type,description,source_page,source_section) on public.program_requirements to authenticated;
grant all on public.program_rule_sets,public.seasons,public.tlt_participants,public.mentor_assignments,public.program_requirements,public.rotations,public.tasks,public.task_submissions,public.task_reviews,public.participant_requirements to service_role;
revoke all on function public.can_manage_program(uuid),public.can_access_participant(uuid,uuid,boolean),public.can_review_task(uuid),public.freeze_rule_version(),public.freeze_requirement(),public.approve_rule_version(uuid,text),public.assign_mentor(uuid,uuid,text,text),public.admit_participant(uuid),public.create_task(uuid,uuid,text,text,date),public.submit_task(uuid,text,text,date),public.review_submission(uuid,text,text) from public,anon,authenticated;
grant execute on function public.can_manage_program(uuid),public.can_access_participant(uuid,uuid,boolean),public.can_review_task(uuid),public.approve_rule_version(uuid,text),public.assign_mentor(uuid,uuid,text,text),public.admit_participant(uuid),public.create_task(uuid,uuid,text,text,date),public.submit_task(uuid,text,text,date),public.review_submission(uuid,text,text) to authenticated;

create trigger audit_rules after insert or update on public.program_rule_sets for each row execute function public.audit_change();
create trigger audit_seasons after insert or update on public.seasons for each row execute function public.audit_change();
create trigger audit_participants after insert or update on public.tlt_participants for each row execute function public.audit_change();
create trigger audit_mentors after insert or update or delete on public.mentor_assignments for each row execute function public.audit_change();
create trigger audit_requirements after insert or update on public.program_requirements for each row execute function public.audit_change();
create trigger audit_rotations after insert or update on public.rotations for each row execute function public.audit_change();
create trigger audit_tasks after insert or update on public.tasks for each row execute function public.audit_change();
create trigger audit_submissions after insert on public.task_submissions for each row execute function public.audit_change();
create trigger audit_reviews after insert on public.task_reviews for each row execute function public.audit_change();
create trigger audit_completions after insert on public.participant_requirements for each row execute function public.audit_change();
