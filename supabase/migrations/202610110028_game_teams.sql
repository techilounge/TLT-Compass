create table public.game_teams (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),session_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 80),maximum_members integer not null default 6 check(maximum_members between 1 and 20),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(club_id,id),unique(club_id,session_id,id),foreign key(club_id,session_id) references public.game_sessions(club_id,id)
);
create unique index game_team_names on public.game_teams(session_id,lower(trim(name)));
create table public.game_team_members (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),session_id uuid not null,team_id uuid not null,participant_id uuid not null,
 joined_by uuid not null references public.profiles(id),joined_at timestamptz not null default now(),ended_by uuid references public.profiles(id),ended_at timestamptz,
 foreign key(club_id,session_id,team_id) references public.game_teams(club_id,session_id,id),foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
 check((ended_at is null and ended_by is null) or(ended_at is not null and ended_by is not null))
);
create unique index one_team_per_session on public.game_team_members(session_id,participant_id) where ended_at is null;
alter table public.game_teams enable row level security;alter table public.game_team_members enable row level security;
create policy game_teams_staff_read on public.game_teams for select to authenticated using(public.is_club_staff(club_id));
create policy game_team_roster_read on public.game_team_members for select to authenticated using(public.is_club_staff(club_id) and public.can_access_participant(club_id,participant_id));
revoke all on public.game_teams,public.game_team_members from public,anon,authenticated;
grant select on public.game_teams,public.game_team_members to authenticated;grant all on public.game_teams,public.game_team_members to service_role;
create trigger audit_game_teams after insert or update on public.game_teams for each row execute function public.audit_change();
create trigger audit_game_team_members after insert or update on public.game_team_members for each row execute function public.audit_change();
create function public.create_game_team(target_session uuid,team_name text,member_ceiling integer) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.game_sessions;result uuid;
begin
 select * into s from public.game_sessions where id=target_session;
 if not found or not public.can_manage_program(s.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into s from public.game_sessions where id=target_session for update;
 if s.status<>'open' then raise exception 'Session closed' using errcode='23514';end if;
 insert into public.game_teams(club_id,session_id,name,maximum_members,created_by) values(s.club_id,s.id,team_name,member_ceiling,auth.uid()) returning id into result;return result;
end; $$;
create function public.assign_game_team(target_team uuid,target_participant uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare team public.game_teams;s public.game_sessions;p public.tlt_participants;existing public.game_team_members;result uuid;
begin
 select * into team from public.game_teams where id=target_team;
 if not found or not public.can_manage_program(team.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into s from public.game_sessions where id=team.session_id for update;
 select * into p from public.tlt_participants where id=target_participant and club_id=team.club_id for update;
 if not found or p.season_id<>s.season_id or p.status<>'active' or p.consent_state<>'confirmed' or s.status<>'open' then raise exception 'Active consented participant in open session required' using errcode='23514';end if;
 select * into existing from public.game_team_members where session_id=s.id and participant_id=p.id and ended_at is null;
 if found and existing.team_id=team.id then return existing.id;end if;
 if (select count(*) from public.game_team_members where team_id=team.id and ended_at is null)>=team.maximum_members then raise exception 'Team capacity reached' using errcode='23514';end if;
 if existing.id is not null then update public.game_team_members set ended_by=auth.uid(),ended_at=now() where id=existing.id;end if;
 insert into public.game_team_members(club_id,session_id,team_id,participant_id,joined_by) values(team.club_id,s.id,team.id,p.id,auth.uid()) returning id into result;return result;
end; $$;
create function public.end_game_team_membership(target_session uuid,target_participant uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.game_sessions;
begin
 select * into s from public.game_sessions where id=target_session;
 if not found or not public.can_manage_program(s.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into s from public.game_sessions where id=target_session for update;
 if s.status<>'open' then raise exception 'Session closed' using errcode='23514';end if;
 update public.game_team_members set ended_by=auth.uid(),ended_at=now() where session_id=s.id and participant_id=target_participant and ended_at is null;
end; $$;
revoke all on function public.create_game_team(uuid,text,integer),public.assign_game_team(uuid,uuid),public.end_game_team_membership(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_game_team(uuid,text,integer),public.assign_game_team(uuid,uuid),public.end_game_team_membership(uuid,uuid) to authenticated;
