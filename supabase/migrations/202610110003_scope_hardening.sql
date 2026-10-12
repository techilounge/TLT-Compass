-- Preserve assignment history when changing mentors, including same-day changes.
alter table public.mentor_assignments add column state text not null default 'active' check(state in ('active','ended'));
create unique index one_open_primary on public.mentor_assignments(club_id,participant_id) where assignment_type='primary' and state='active';
create or replace function public.can_access_participant(target_club uuid,target_participant uuid,staff_only boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tlt_participants p where p.club_id=target_club and p.id=target_participant and (
    public.can_manage_program(target_club)
    or (not staff_only and p.profile_id=auth.uid() and public.has_club_role(target_club,array['participant']::public.club_role[]))
    or (public.is_club_staff(target_club) and exists(select 1 from public.mentor_assignments m
      where m.club_id=target_club and m.participant_id=p.id and m.mentor_profile_id=auth.uid() and m.state='active'
      and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)))
  ));
$$;
create or replace function public.can_review_task(target_task uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.tlt_participants p on p.club_id=t.club_id and p.id=t.participant_id
    join public.program_requirements r on r.club_id=t.club_id and r.id=t.requirement_id
    where t.id=target_task and p.profile_id is distinct from auth.uid() and (
      public.can_manage_program(t.club_id) or (public.is_club_staff(t.club_id) and exists (
        select 1 from public.mentor_assignments m join public.staff_eligibility e on e.club_id=m.club_id and e.profile_id=m.mentor_profile_id
        where m.club_id=t.club_id and m.participant_id=t.participant_id and m.state='active' and e.eligible
        and m.mentor_profile_id=auth.uid() and m.starts_on<=current_date and (m.ends_on is null or m.ends_on>=current_date)
        and (m.assignment_type='primary' or m.department_code=r.department_code)
      ))
    ));
$$;
create or replace function public.assign_mentor(target_participant uuid,target_mentor uuid,kind text,department text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; result uuid; expected_role public.club_role;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_manage_program(p.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if kind not in ('primary','operational') then raise exception 'Invalid assignment type' using errcode='23514'; end if;
  expected_role:=case when kind='primary' then 'primary_mentor'::public.club_role else 'operational_mentor'::public.club_role end;
  if p.profile_id=target_mentor or not exists(select 1 from public.club_memberships m join public.staff_eligibility e using(club_id,profile_id)
    where m.club_id=p.club_id and m.profile_id=target_mentor and m.role in (expected_role,'director','coordinator') and m.status='active' and e.eligible)
  then raise exception 'Eligible adult mentor in this club required' using errcode='42501'; end if;
  if kind='primary' then update public.mentor_assignments set state='ended',ends_on=greatest(starts_on,current_date)
    where club_id=p.club_id and participant_id=p.id and assignment_type='primary' and state='active'; end if;
  insert into public.mentor_assignments(club_id,participant_id,mentor_profile_id,assignment_type,department_code,starts_on)
  values(p.club_id,p.id,target_mentor,kind,department,current_date) returning id into result;
  return result;
end;
$$;
-- Profile links must be a currently enrolled participant of the same club.
create function public.validate_participant_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.profile_id is not null and not exists(select 1 from public.club_memberships m
    where m.club_id=new.club_id and m.profile_id=new.profile_id and m.role='participant' and m.status='active')
  then raise exception 'Participant account must belong to this club' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger participant_account_scope before insert or update of profile_id on public.tlt_participants for each row execute function public.validate_participant_profile();
create policy profile_club_directory on public.profiles for select to authenticated using(exists(
  select 1 from public.club_memberships m where m.profile_id=profiles.id and m.status='active' and public.can_manage_program(m.club_id)
));

create function public.create_rotation(target_participant uuid,target_assignment uuid,department text,starts date,ends date) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants; result uuid;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_manage_program(p.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.mentor_assignments m join public.staff_eligibility e on e.club_id=m.club_id and e.profile_id=m.mentor_profile_id
    join public.club_memberships cm on cm.club_id=m.club_id and cm.profile_id=m.mentor_profile_id
    where m.id=target_assignment and m.club_id=p.club_id and m.participant_id=p.id and m.state='active' and e.eligible
    and cm.status='active' and cm.role in ('director','coordinator','primary_mentor','operational_mentor')
    and m.starts_on<=starts and (m.ends_on is null or m.ends_on>=ends) and (m.assignment_type='primary' or m.department_code=department))
  then raise exception 'Rotation requires the assigned eligible mentor' using errcode='23514'; end if;
  insert into public.rotations(club_id,participant_id,department_code,mentor_assignment_id,starts_on,ends_on)
  values(p.club_id,p.id,department,target_assignment,starts,ends) returning id into result;
  return result;
end;
$$;
create function public.review_rotation(target_rotation uuid) returns void language plpgsql security definer set search_path='' as $$
declare rotation public.rotations;
begin
  select * into rotation from public.rotations where id=target_rotation for update;
  if not found or not public.can_access_participant(rotation.club_id,rotation.participant_id,true) then raise exception 'Not authorized' using errcode='42501'; end if;
  if rotation.status<>'active' then raise exception 'Rotation already reviewed' using errcode='23514'; end if;
  if not public.can_manage_program(rotation.club_id) and not exists(select 1 from public.mentor_assignments m where m.id=rotation.mentor_assignment_id and m.state='active' and m.mentor_profile_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if exists(select 1 from public.tlt_participants where id=rotation.participant_id and profile_id=auth.uid()) then raise exception 'No self-review' using errcode='42501'; end if;
  update public.rotations set status='reviewed',reviewed_by=auth.uid(),reviewed_at=now() where id=rotation.id;
end;
$$;
revoke all on function public.validate_participant_profile(),public.create_rotation(uuid,uuid,text,date,date),public.review_rotation(uuid) from public,anon,authenticated;
grant execute on function public.create_rotation(uuid,uuid,text,date,date),public.review_rotation(uuid) to authenticated;
