create function public.visible_club_today(target_club uuid) returns date language sql stable set search_path='' as $$
  select (now() at time zone timezone)::date from public.clubs where id=target_club;
$$;
revoke all on function public.visible_club_today(uuid) from public,anon,authenticated;
grant execute on function public.visible_club_today(uuid) to authenticated;
-- All aggregates execute as the requesting user and retain the underlying RLS scope.
create function public.progress_dashboard(target_club uuid,target_season uuid default null,selected_level integer default null,target_mentor uuid default null,department text default null)
returns jsonb language sql stable set search_path='' as $$
  with people as (
    select p.* from public.tlt_participants p where p.club_id=target_club
      and (target_season is null or p.season_id=target_season) and (selected_level is null or p.current_level=selected_level)
      and (target_mentor is null or exists(select 1 from public.mentor_assignments m where m.club_id=p.club_id and m.participant_id=p.id and m.mentor_profile_id=target_mentor and m.state='active' and m.starts_on<=public.visible_club_today(p.club_id) and (m.ends_on is null or m.ends_on>=public.visible_club_today(p.club_id))))
      and (department is null or exists(select 1 from public.rotations r where r.club_id=p.club_id and r.participant_id=p.id and r.department_code=department and r.status='active'))
  ), tasks as (
    select t.* from public.tasks t join people p on p.club_id=t.club_id and p.id=t.participant_id
      join public.program_requirements r on r.club_id=t.club_id and r.id=t.requirement_id where department is null or r.department_code=department
  ), requirements as (
    select p.id participant_id,r.id requirement_id,pr.completed_at from people p join public.seasons s on s.club_id=p.club_id and s.id=p.season_id
      join public.program_rule_sets v on v.club_id=s.club_id and v.id=s.rule_set_id and v.status='approved'
      join public.program_requirements r on r.club_id=s.club_id and r.rule_set_id=s.rule_set_id and r.level=p.current_level and r.requirement_type='required'
      left join public.participant_requirements pr on pr.club_id=p.club_id and pr.participant_id=p.id and pr.rule_set_id=s.rule_set_id and pr.requirement_id=r.id
      where department is null or r.department_code=department
  ), attendance as (select a.* from people p cross join lateral public.attendance_summary(p.id) a),
  hours as (select h.* from public.training_hours h join people p on p.club_id=h.club_id and p.id=h.participant_id where department is null or h.department_code=department)
  select jsonb_build_object(
    'participants',(select count(*) from people),
    'active',(select count(*) from people where status='active'),
    'pending_enrollment',(select count(*) from people where status='pending'),
    'missing_primary_mentor',(select count(*) from people p where not exists(select 1 from public.mentor_assignments m where m.club_id=p.club_id and m.participant_id=p.id and m.assignment_type='primary' and m.state='active' and m.starts_on<=public.visible_club_today(p.club_id) and (m.ends_on is null or m.ends_on>=public.visible_club_today(p.club_id)))),
    'tasks',(select count(*) from tasks),
    'pending_reviews',(select count(*) from tasks where status='submitted'),
    'overdue_tasks',(select count(*) from tasks where due_on<public.visible_club_today(target_club) and status in ('assigned','in_progress','changes_requested')),
    'verified_tasks',(select count(*) from tasks where status in ('verified','closed')),
    'required_total',(select count(*) from requirements),
    'required_completed',(select count(*) from requirements where completed_at is not null),
    'attendance_numerator',(select coalesce(sum(attended),0) from attendance),
    'attendance_denominator',(select coalesce(sum(attendance_denominator),0) from attendance),
    'uniform_numerator',(select coalesce(sum(uniform_compliant),0) from attendance),
    'uniform_denominator',(select coalesce(sum(uniform_denominator),0) from attendance),
    'workshop_minutes',(select coalesce(sum(duration_minutes),0) from hours where category='workshop' and status='verified'),
    'lab_minutes',(select coalesce(sum(duration_minutes),0) from hours where category='lab' and status='verified'),
    'pending_hour_reviews',(select count(*) from hours where status='pending'),
    'enrolled_by_level',(select coalesce(jsonb_object_agg(current_level,total),'{}'::jsonb) from (select current_level,count(*) total from people group by current_level) x),
    'mentor_caseload',(select coalesce(jsonb_agg(jsonb_build_object('mentor_id',mentor_profile_id,'participants',total)),'[]'::jsonb) from (select m.mentor_profile_id,count(distinct m.participant_id) total from public.mentor_assignments m join people p on p.club_id=m.club_id and p.id=m.participant_id where m.state='active' and m.starts_on<=public.visible_club_today(m.club_id) and (m.ends_on is null or m.ends_on>=public.visible_club_today(m.club_id)) group by m.mentor_profile_id) x)
  );
$$;
revoke all on function public.progress_dashboard(uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.progress_dashboard(uuid,uuid,integer,uuid,text) to authenticated;

create function public.workspace_reminders(target_club uuid)
returns table(task_id uuid,participant_id uuid,title text,due_on date,status text,reminder text)
language sql stable set search_path='' as $$
  select t.id,t.participant_id,t.title,t.due_on,t.status,case when t.status='submitted' then 'Awaiting adult review' when t.due_on<public.visible_club_today(target_club) then 'Past due; check in with your mentor' else 'Due within seven days' end
  from public.tasks t where t.club_id=target_club and (t.status='submitted' or (t.status in ('assigned','in_progress','changes_requested') and t.due_on<=public.visible_club_today(target_club)+7))
  order by t.due_on nulls last,t.created_at limit 100;
$$;
revoke all on function public.workspace_reminders(uuid) from public,anon,authenticated;
grant execute on function public.workspace_reminders(uuid) to authenticated;
