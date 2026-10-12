create table public.notification_preferences (
 club_id uuid not null references public.clubs(id),profile_id uuid not null references public.profiles(id),task_updates boolean not null default true,primary key(club_id,profile_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),recipient_id uuid not null references public.profiles(id),
 participant_id uuid not null,task_id uuid not null,kind text not null check(kind in ('assigned','submitted','changes_requested','verified','closed','cancelled')),
 created_at timestamptz not null default now(),read_at timestamptz,
 foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),foreign key(club_id,task_id) references public.tasks(club_id,id)
);
create index notifications_recipient_time on public.notifications(club_id,recipient_id,created_at desc,id);
alter table public.notifications enable row level security;alter table public.notification_preferences enable row level security;
create policy inbox_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and public.can_access_participant(club_id,participant_id) and exists(select 1 from public.tlt_participants p where p.id=participant_id and p.club_id=notifications.club_id and p.consent_state='confirmed' and p.status='active'));
create policy notification_preferences_read on public.notification_preferences for select to authenticated using(profile_id=auth.uid() and public.has_club_role(club_id,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[]));
revoke all on public.notifications,public.notification_preferences from public,anon,authenticated;
grant select on public.notifications,public.notification_preferences to authenticated;grant all on public.notifications,public.notification_preferences to service_role;
create function public.set_notification_preferences(target_club uuid,receive_task_updates boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if receive_task_updates is null or not public.has_club_role(target_club,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501';end if;
 insert into public.notification_preferences(club_id,profile_id,task_updates) values(target_club,auth.uid(),receive_task_updates) on conflict(club_id,profile_id) do update set task_updates=excluded.task_updates;
end; $$;
create function public.mark_notification_read(target_notification uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.notifications;
begin
 select * into item from public.notifications where id=target_notification;
 if not found or item.recipient_id is distinct from auth.uid() or not public.can_access_participant(item.club_id,item.participant_id) or not exists(select 1 from public.tlt_participants p where p.id=item.participant_id and p.club_id=item.club_id and p.consent_state='confirmed' and p.status='active') then raise exception 'Not authorized' using errcode='42501';end if;
 update public.notifications set read_at=coalesce(read_at,now()) where id=item.id;
end; $$;
create function public.notify_task_transition() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants;
begin
 if new.status=old.status or new.status not in ('assigned','submitted','changes_requested','verified','closed','cancelled') then return new;end if;
 select * into p from public.tlt_participants where id=new.participant_id and club_id=new.club_id;
 if p.status<>'active' or p.consent_state<>'confirmed' then return new;end if;
 insert into public.notifications(club_id,recipient_id,participant_id,task_id,kind)
 select new.club_id,m.profile_id,p.id,new.id,new.status from public.club_memberships m
 left join public.notification_preferences pref on pref.club_id=m.club_id and pref.profile_id=m.profile_id
 where m.club_id=new.club_id and m.status='active' and coalesce(pref.task_updates,true)
 and ((new.status<>'submitted' and m.role='participant' and m.profile_id=p.profile_id)
 or (new.status='submitted' and m.role in ('director','coordinator','primary_mentor','operational_mentor') and m.profile_id is distinct from p.profile_id and exists(select 1 from public.staff_eligibility e where e.club_id=m.club_id and e.profile_id=m.profile_id and e.eligible)
 and (m.role in ('director','coordinator') or exists(select 1 from public.mentor_assignments a where a.club_id=m.club_id and a.participant_id=p.id and a.mentor_profile_id=m.profile_id and a.state='active' and (a.assignment_type='primary' or a.department_code=(select r.department_code from public.program_requirements r where r.id=new.requirement_id and r.club_id=new.club_id)) and a.starts_on<=current_date and (a.ends_on is null or a.ends_on>=current_date)))))
 group by m.profile_id;
 return new;
end; $$;
create trigger task_inbox_transition after update of status on public.tasks for each row execute function public.notify_task_transition();
revoke all on function public.notify_task_transition(),public.set_notification_preferences(uuid,boolean),public.mark_notification_read(uuid) from public,anon,authenticated;
grant execute on function public.set_notification_preferences(uuid,boolean),public.mark_notification_read(uuid) to authenticated;

