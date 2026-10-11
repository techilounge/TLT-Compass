alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check(status in ('draft','assigned','in_progress','submitted','changes_requested','verified','closed','cancelled'));

create function public.create_task_draft(target_participant uuid,target_requirement uuid,task_title text,task_instructions text,task_due_on date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  result:=public.create_task(target_participant,target_requirement,task_title,task_instructions,task_due_on);
  update public.tasks set status='draft' where id=result;
  return result;
end;
$$;

create function public.transition_task(target_task uuid,expected_status text,next_status text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks; p public.tlt_participants;
begin
  select * into t from public.tasks where id=target_task for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.tlt_participants where id=t.participant_id and club_id=t.club_id for update;
  if next_status='in_progress' then
    if p.profile_id is distinct from auth.uid() or not public.has_club_role(t.club_id,array['participant']::public.club_role[]) then
      raise exception 'Not authorized' using errcode='42501';
    end if;
  elsif not public.can_review_task(t.id) then raise exception 'Not authorized' using errcode='42501';
  end if;
  if t.status is distinct from expected_status then raise exception 'Task changed; refresh before retrying' using errcode='23514'; end if;
  if not ((t.status='draft' and next_status='assigned')
    or (t.status='assigned' and next_status='in_progress')
    or (t.status='verified' and next_status='closed')
    or (t.status in ('draft','assigned','in_progress','changes_requested') and next_status='cancelled')) then
    raise exception 'Invalid task transition' using errcode='23514';
  end if;
  if next_status in ('assigned','in_progress') and (p.status<>'active' or p.consent_state<>'confirmed') then
    raise exception 'Active participant and consent required' using errcode='23514';
  end if;
  update public.tasks set status=next_status where id=t.id;
end;
$$;
revoke all on function public.create_task_draft(uuid,uuid,text,text,date),public.transition_task(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_task_draft(uuid,uuid,text,text,date),public.transition_task(uuid,text,text) to authenticated;
create policy draft_tasks_staff_only on public.tasks as restrictive for select to authenticated
using(status<>'draft' or public.can_review_task(id));
