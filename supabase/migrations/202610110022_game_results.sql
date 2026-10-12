create table public.game_sessions (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),season_id uuid not null,title text not null check(length(trim(title)) between 1 and 160),
 mode text not null check(mode in ('quick_round','team_challenge','scenario_debate','escape_challenge','planning_sprint','service_bingo','reflection_cards','custom')),
 instructions text not null check(length(trim(instructions)) between 1 and 4000),maximum_score integer not null check(maximum_score between 1 and 100000),maximum_attempts integer not null default 1 check(maximum_attempts between 1 and 10),status text not null default 'open' check(status in ('open','closed')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),closed_by uuid references public.profiles(id),closed_at timestamptz,unique(club_id,id),foreign key(club_id,season_id) references public.seasons(club_id,id)
);
create table public.game_scores (
 id uuid primary key,club_id uuid not null references public.clubs(id),session_id uuid not null,participant_id uuid not null,score integer not null check(score between 0 and 100000),source_kind text not null check(source_kind in ('manual','sabiquiz_manual')),
 source_reference text not null check(length(trim(source_reference)) between 1 and 500),status text not null default 'pending' check(status in ('pending','verified','rejected')),submitted_by uuid not null references public.profiles(id),submitted_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text check(length(review_note)<=1000),
 unique(club_id,id),foreign key(club_id,session_id) references public.game_sessions(club_id,id),foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),check((status='pending' and reviewed_by is null and reviewed_at is null) or(status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
alter table public.game_sessions enable row level security;alter table public.game_scores enable row level security;
create policy game_sessions_read on public.game_sessions for select to authenticated using(public.is_club_staff(club_id) or public.has_club_role(club_id,array['participant']::public.club_role[]));
create policy game_scores_read on public.game_scores for select to authenticated using(public.can_access_participant(club_id,participant_id));
revoke all on public.game_sessions,public.game_scores from public,anon,authenticated;grant select on public.game_sessions,public.game_scores to authenticated;grant all on public.game_sessions,public.game_scores to service_role;
create trigger audit_game_sessions after insert or update on public.game_sessions for each row execute function public.audit_change();
create trigger audit_game_scores after insert or update on public.game_scores for each row execute function public.audit_change();
create function public.create_game_session(target_club uuid,target_season uuid,session_title text,game_mode text,session_instructions text,score_ceiling integer,attempt_ceiling integer) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.is_club_staff(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 insert into public.game_sessions(club_id,season_id,title,mode,instructions,maximum_score,maximum_attempts,created_by) values(target_club,target_season,session_title,game_mode,session_instructions,score_ceiling,attempt_ceiling,auth.uid()) returning id into result;return result;
end; $$;
create function public.close_game_session(target_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.game_sessions;
begin
 select * into s from public.game_sessions where id=target_session for update;
 if not found or not public.is_club_staff(s.club_id) or (s.created_by<>auth.uid() and not public.can_manage_program(s.club_id)) then raise exception 'Not authorized' using errcode='42501';end if;
 if s.status='closed' then return;end if;update public.game_sessions set status='closed',closed_by=auth.uid(),closed_at=now() where id=s.id;
end; $$;
create function public.submit_game_score(request_id uuid,target_session uuid,target_participant uuid,reported_score integer,score_source text,score_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.game_sessions;p public.tlt_participants;existing public.game_scores;
begin
 select * into s from public.game_sessions where id=target_session for update;
 select * into p from public.tlt_participants where club_id=s.club_id and id=target_participant for update;
 if not found or not public.can_access_participant(p.club_id,p.id) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into existing from public.game_scores where id=request_id;
 if found then if existing.club_id=s.club_id and existing.participant_id=p.id and existing.session_id=s.id and existing.score=reported_score and existing.source_kind=score_source and existing.source_reference=score_reference and existing.submitted_by=auth.uid() then return existing.id;end if;raise exception 'Request ID used' using errcode='23514';end if;
 if s.status<>'open' or p.season_id<>s.season_id or p.status<>'active' or p.consent_state<>'confirmed' or reported_score not between 0 and s.maximum_score or (select count(*) from public.game_scores where session_id=s.id and participant_id=p.id and status<>'rejected')>=s.maximum_attempts then raise exception 'Score unavailable, invalid or attempt limit reached' using errcode='23514';end if;
 insert into public.game_scores(id,club_id,session_id,participant_id,score,source_kind,source_reference,submitted_by) values(request_id,s.club_id,s.id,p.id,reported_score,score_source,score_reference,auth.uid());return request_id;
end; $$;
create function public.review_game_score(target_score uuid,decision text,feedback text) returns void language plpgsql security definer set search_path='' as $$
declare g public.game_scores;p public.tlt_participants;
begin
 select * into g from public.game_scores where id=target_score;
 select * into p from public.tlt_participants where club_id=g.club_id and id=g.participant_id for update;
 if not found or p.profile_id=auth.uid() or not(public.can_manage_program(g.club_id) or public.is_assigned_mentor(g.club_id,p.id,null)) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into g from public.game_scores where id=target_score for update;
 if g.status<>'pending' or decision not in ('verified','rejected') or length(trim(coalesce(feedback,''))) not between 1 and 1000 then raise exception 'Pending score and review note required' using errcode='23514';end if;
 update public.game_scores set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=feedback where id=g.id;
end; $$;
revoke all on function public.create_game_session(uuid,uuid,text,text,text,integer,integer),public.close_game_session(uuid),public.submit_game_score(uuid,uuid,uuid,integer,text,text),public.review_game_score(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_game_session(uuid,uuid,text,text,text,integer,integer),public.close_game_session(uuid),public.submit_game_score(uuid,uuid,uuid,integer,text,text),public.review_game_score(uuid,text,text) to authenticated;
