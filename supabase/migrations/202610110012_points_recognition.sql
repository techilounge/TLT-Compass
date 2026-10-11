-- Configurable local recognition; never used to sign requirements or promote levels.
create table public.point_rules (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  name text not null check(length(trim(name)) between 1 and 120), version text not null check(length(trim(version)) between 1 and 80),
  category text not null check(category in ('attendance','task','leadership','collaboration','reflection','service','quiz')),
  points integer not null check(points between 1 and 1000), activity_cap integer not null check(activity_cap between points and 1000),
  monthly_cap integer not null check(monthly_cap between points and 10000),
  department_code text check(department_code in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')),
  status text not null default 'draft' check(status in ('draft','approved','retired')),
  created_by uuid not null references public.profiles(id), approved_by uuid references public.profiles(id),approved_at timestamptz,
  unique(club_id,id),unique(club_id,name,version),
  check(status='draft' or (approved_by is not null and approved_at is not null))
);
create table public.recognition_settings (
  club_id uuid primary key references public.clubs(id),
  quiz_contribution_percent integer not null default 25 check(quiz_contribution_percent between 0 and 50),
  leaderboard_enabled boolean not null default false,
  updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
create table public.leaderboard_consents (
  club_id uuid not null references public.clubs(id),participant_id uuid not null,
  opted_in boolean not null default false,reviewed_by uuid not null references public.profiles(id),reviewed_at timestamptz not null default now(),
  primary key(club_id,participant_id),foreign key(club_id,participant_id) references public.tlt_participants(club_id,id)
);
create table public.points_ledger (
  id uuid primary key,club_id uuid not null references public.clubs(id),participant_id uuid not null,rule_id uuid,
  source_kind text not null check(source_kind in ('attendance','task_review','training_hours','manual','reversal')),
  source_id uuid not null,points_delta integer not null check(points_delta<>0 and abs(points_delta)<=1000),
  actor_id uuid not null references public.profiles(id),reason text not null check(length(trim(reason)) between 1 and 1000),
  awarded_on date not null,created_at timestamptz not null default now(),reversal_of uuid,
  unique(club_id,id),unique(reversal_of),
  foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),
  foreign key(club_id,rule_id) references public.point_rules(club_id,id),
  foreign key(club_id,reversal_of) references public.points_ledger(club_id,id),
  check((points_delta>0 and rule_id is not null and reversal_of is null and source_kind<>'reversal') or
    (points_delta<0 and reversal_of is not null and source_kind='reversal'))
);
create unique index unique_award_source on public.points_ledger(club_id,participant_id,rule_id,source_kind,source_id) where reversal_of is null;
create index points_participant_date on public.points_ledger(club_id,participant_id,awarded_on);
create table public.badge_definitions (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),
  name text not null check(length(trim(name)) between 1 and 100),criteria text not null check(length(trim(criteria)) between 1 and 2000),
  approved_by uuid not null references public.profiles(id),approved_at timestamptz not null default now(),
  unique(club_id,id),unique(club_id,name)
);
create table public.badge_awards (
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),participant_id uuid not null,badge_id uuid not null,
  awarded_by uuid not null references public.profiles(id),awarded_at timestamptz not null default now(),
  reason text not null check(length(trim(reason)) between 1 and 1000),revoked_by uuid references public.profiles(id),revoked_at timestamptz,revoke_reason text,
  foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),foreign key(club_id,badge_id) references public.badge_definitions(club_id,id),
  unique(club_id,participant_id,badge_id),check((revoked_by is null and revoked_at is null and revoke_reason is null) or (revoked_by is not null and revoked_at is not null and length(trim(revoke_reason)) between 1 and 1000))
);
alter table public.point_rules enable row level security;
alter table public.recognition_settings enable row level security;
alter table public.leaderboard_consents enable row level security;
alter table public.points_ledger enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.badge_awards enable row level security;
create policy point_rules_read on public.point_rules for select to authenticated using(public.is_club_staff(club_id) or public.has_club_role(club_id,array['participant']::public.club_role[]));
create policy recognition_settings_read on public.recognition_settings for select to authenticated using(public.is_club_staff(club_id) or public.has_club_role(club_id,array['participant']::public.club_role[]));
create policy consent_read on public.leaderboard_consents for select to authenticated using(public.can_access_participant(club_id,participant_id));
create policy points_read on public.points_ledger for select to authenticated using(public.can_access_participant(club_id,participant_id));
create policy badges_read on public.badge_definitions for select to authenticated using(public.is_club_staff(club_id) or public.has_club_role(club_id,array['participant']::public.club_role[]));
create policy badge_awards_read on public.badge_awards for select to authenticated using(public.can_access_participant(club_id,participant_id));
revoke all on public.point_rules,public.recognition_settings,public.leaderboard_consents,public.points_ledger,public.badge_definitions,public.badge_awards from public,anon,authenticated;
grant select on public.point_rules,public.recognition_settings,public.leaderboard_consents,public.points_ledger,public.badge_definitions,public.badge_awards to authenticated;
grant all on public.point_rules,public.recognition_settings,public.leaderboard_consents,public.points_ledger,public.badge_definitions,public.badge_awards to service_role;
create trigger immutable_points before update or delete or truncate on public.points_ledger for each statement execute function public.reject_audit_mutation();
create trigger immutable_badge_definitions before update or delete or truncate on public.badge_definitions for each statement execute function public.reject_audit_mutation();
create trigger audit_point_rules after insert or update on public.point_rules for each row execute function public.audit_change();
create trigger audit_points after insert on public.points_ledger for each row execute function public.audit_change();
create trigger audit_recognition_settings after insert or update on public.recognition_settings for each row execute function public.audit_change();
create trigger audit_leaderboard_consent after insert or update on public.leaderboard_consents for each row execute function public.audit_change();
create trigger audit_badges after insert or update on public.badge_awards for each row execute function public.audit_change();
create trigger audit_badge_definitions after insert on public.badge_definitions for each row execute function public.audit_change();
create function public.freeze_point_rule() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or (to_jsonb(new)-array['status','approved_by','approved_at']) is distinct from (to_jsonb(old)-array['status','approved_by','approved_at']) then
    raise exception 'Point rule versions are immutable; create a new version' using errcode='23514'; end if;
  return new;
end; $$;
create trigger immutable_point_rules before update or delete on public.point_rules for each row execute function public.freeze_point_rule();
create function public.audit_recognition_choice() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details)
    values(new.club_id,auth.uid(),'configuration_choice',tg_table_name,coalesce(to_jsonb(new)->>'participant_id',new.club_id::text),
      jsonb_strip_nulls(jsonb_build_object('opted_in',to_jsonb(new)->'opted_in','leaderboard_enabled',to_jsonb(new)->'leaderboard_enabled','quiz_contribution_percent',to_jsonb(new)->'quiz_contribution_percent')));
  return new;
end; $$;
create trigger recognition_choice after insert or update on public.recognition_settings for each row execute function public.audit_recognition_choice();
create trigger leaderboard_choice after insert or update on public.leaderboard_consents for each row execute function public.audit_recognition_choice();
create function public.points_balance(target_participant uuid) returns bigint language sql stable set search_path='' as $$
  select coalesce(sum(points_delta),0) from public.points_ledger where participant_id=target_participant;
$$;
revoke all on function public.points_balance(uuid),public.freeze_point_rule(),public.audit_recognition_choice() from public,anon,authenticated;
grant execute on function public.points_balance(uuid) to authenticated;

create function public.configure_recognition(target_club uuid,quiz_percent integer,rankings_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.has_club_role(target_club,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.recognition_settings(club_id,quiz_contribution_percent,leaderboard_enabled,updated_by) values(target_club,quiz_percent,rankings_enabled,auth.uid())
    on conflict(club_id) do update set quiz_contribution_percent=excluded.quiz_contribution_percent,leaderboard_enabled=excluded.leaderboard_enabled,updated_by=auth.uid(),updated_at=now();
end; $$;
create function public.create_point_rule(target_club uuid,rule_name text,rule_version text,rule_category text,award_points integer,per_activity_cap integer,per_month_cap integer,department text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.point_rules(club_id,name,version,category,points,activity_cap,monthly_cap,department_code,created_by)
    values(target_club,rule_name,rule_version,rule_category,award_points,per_activity_cap,per_month_cap,department,auth.uid()) returning id into result;
  return result;
end; $$;
create function public.set_point_rule_status(target_rule uuid,rule_status text) returns void language plpgsql security definer set search_path='' as $$
declare r public.point_rules;
begin
  select * into r from public.point_rules where id=target_rule for update;
  if not found or not public.has_club_role(r.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if rule_status is null or not ((r.status='draft' and rule_status='approved') or (r.status='approved' and rule_status='retired')) then raise exception 'Invalid rule transition' using errcode='23514'; end if;
  update public.point_rules set status=rule_status,approved_by=case when rule_status='approved' then auth.uid() else approved_by end,approved_at=case when rule_status='approved' then now() else approved_at end where id=r.id;
end; $$;
create function public.award_points(request_id uuid,target_participant uuid,target_rule uuid,event_kind text,event_id uuid,award_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants;r public.point_rules;existing public.points_ledger;monthly_total bigint;activity_total bigint;quiz_total bigint;other_total bigint;quiz_percent integer;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_access_participant(p.club_id,p.id,true) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p.profile_id=auth.uid() then raise exception 'No self-award' using errcode='42501'; end if;
  if p.consent_state<>'confirmed' or p.status not in ('pending','active') then raise exception 'Consent and enrollment required' using errcode='23514'; end if;
  select * into r from public.point_rules where id=target_rule and club_id=p.club_id for update;
  if not found or r.status<>'approved' then raise exception 'Approved rule required' using errcode='23514'; end if;
  if not (public.can_manage_program(p.club_id) or public.is_assigned_mentor(p.club_id,p.id,r.department_code)) then raise exception 'Assignment required' using errcode='42501'; end if;
  select * into existing from public.points_ledger where id=request_id;
  if found then
    if existing.participant_id=p.id and existing.rule_id=r.id and existing.source_kind=event_kind and existing.source_id=event_id and existing.actor_id=auth.uid() and existing.reason=award_reason then return existing.id; end if;
    raise exception 'Request ID already used' using errcode='23514';
  end if;
  if event_kind='attendance' then
    if r.category<>'attendance' or not exists(select 1 from public.attendance_entries where id=event_id and club_id=p.club_id and participant_id=p.id and status='verified' and attendance='present') then raise exception 'Verified attendance required' using errcode='23514'; end if;
  elsif event_kind='task_review' then
    if r.category not in ('task','reflection','leadership','collaboration','service') or not exists(select 1 from public.task_reviews v join public.task_submissions s on s.club_id=v.club_id and s.id=v.submission_id join public.tasks t on t.club_id=s.club_id and t.id=s.task_id where v.id=event_id and t.club_id=p.club_id and t.participant_id=p.id and v.decision='verified') then raise exception 'Verified task review required' using errcode='23514'; end if;
  elsif event_kind='training_hours' then
    if r.category='quiz' or not exists(select 1 from public.training_hours where id=event_id and club_id=p.club_id and participant_id=p.id and status='verified') then raise exception 'Verified hours required' using errcode='23514'; end if;
  elsif event_kind='manual' then
    if not public.can_manage_program(p.club_id) or r.category='attendance' then raise exception 'Manager source review required' using errcode='42501'; end if;
  else raise exception 'Invalid source kind' using errcode='23514'; end if;
  select coalesce(sum(l.points_delta),0) into monthly_total from public.points_ledger l where l.club_id=p.club_id and l.participant_id=p.id and l.rule_id=r.id and date_trunc('month',l.awarded_on::timestamp)=date_trunc('month',public.club_today(p.club_id)::timestamp);
  select coalesce(sum(l.points_delta),0) into activity_total from public.points_ledger l join public.point_rules pr on pr.id=l.rule_id and pr.club_id=l.club_id where l.club_id=p.club_id and l.participant_id=p.id and l.source_id=event_id and pr.category=r.category;
  if monthly_total+r.points>r.monthly_cap or activity_total+r.points>r.activity_cap then raise exception 'Award cap exceeded' using errcode='23514'; end if;
  if r.category='quiz' then
    select coalesce(s.quiz_contribution_percent,25) into quiz_percent from (select 1) x left join public.recognition_settings s on s.club_id=p.club_id;
    select coalesce(sum(l.points_delta) filter(where pr.category='quiz'),0),coalesce(sum(l.points_delta) filter(where pr.category<>'quiz'),0) into quiz_total,other_total from public.points_ledger l join public.point_rules pr on pr.id=l.rule_id and pr.club_id=l.club_id where l.club_id=p.club_id and l.participant_id=p.id;
    if (quiz_total+r.points)*100>(quiz_total+other_total+r.points)*quiz_percent then raise exception 'Quiz contribution cap exceeded' using errcode='23514'; end if;
  end if;
  insert into public.points_ledger(id,club_id,participant_id,rule_id,source_kind,source_id,points_delta,actor_id,reason,awarded_on) values(request_id,p.club_id,p.id,r.id,event_kind,event_id,r.points,auth.uid(),award_reason,public.club_today(p.club_id));
  return request_id;
end; $$;
create function public.reverse_points(request_id uuid,target_award uuid,reversal_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.points_ledger; existing public.points_ledger;
begin
  perform 1 from public.tlt_participants p join public.points_ledger l on l.club_id=p.club_id and l.participant_id=p.id where l.id=target_award for update of p;
  select * into a from public.points_ledger where id=target_award for update;
  if not found or not public.has_club_role(a.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if a.points_delta<=0 then raise exception 'Cannot reverse a reversal' using errcode='23514'; end if;
  select * into existing from public.points_ledger where id=request_id;
  if found then
    if existing.reversal_of=a.id and existing.actor_id=auth.uid() and existing.reason=reversal_reason then return existing.id; end if;
    raise exception 'Request ID already used' using errcode='23514'; end if;
  insert into public.points_ledger(id,club_id,participant_id,rule_id,source_kind,source_id,points_delta,actor_id,reason,awarded_on,reversal_of)
    values(request_id,a.club_id,a.participant_id,a.rule_id,'reversal',a.source_id,-a.points_delta,auth.uid(),reversal_reason,a.awarded_on,a.id);
  return request_id;
end; $$;
create function public.set_leaderboard_consent(target_participant uuid,allow_ranking boolean,consent_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if allow_ranking then
    if consent_confirmed is distinct from true or p.consent_state<>'confirmed' or not public.has_club_role(p.club_id,array['director']::public.club_role[]) then raise exception 'Director-confirmed consent required' using errcode='42501'; end if;
  elsif not (public.has_club_role(p.club_id,array['director']::public.club_role[]) or (p.profile_id=auth.uid() and public.has_club_role(p.club_id,array['participant']::public.club_role[]))) then raise exception 'Not authorized' using errcode='42501'; end if;
  if allow_ranking is null then raise exception 'Consent choice required' using errcode='23514'; end if;
  insert into public.leaderboard_consents(club_id,participant_id,opted_in,reviewed_by) values(p.club_id,p.id,allow_ranking,auth.uid()) on conflict(club_id,participant_id) do update set opted_in=excluded.opted_in,reviewed_by=auth.uid(),reviewed_at=now();
end; $$;
create function public.private_leaderboard(target_club uuid,period text,selected_level integer default null,target_season uuid default null)
returns table(alias text,level integer,points bigint) language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;today date;
begin
  if not (public.is_club_staff(target_club) or public.has_club_role(target_club,array['participant']::public.club_role[])) then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.recognition_settings where club_id=target_club and leaderboard_enabled) then return; end if;
  today:=public.club_today(target_club);
  if period='month' then first_day:=date_trunc('month',today::timestamp)::date;last_day:=(first_day+interval '1 month' - interval '1 day')::date;
  elsif period='year' then first_day:=date_trunc('year',today::timestamp)::date;last_day:=(first_day+interval '1 year' - interval '1 day')::date;
  elsif period='season' then select starts_on,ends_on into first_day,last_day from public.seasons where id=target_season and club_id=target_club; if not found then raise exception 'Season required' using errcode='23514'; end if;
  elsif period='all' then first_day:='0001-01-01';last_day:='9999-12-31';
  else raise exception 'Invalid ranking period' using errcode='23514'; end if;
  return query select p.public_alias,p.current_level,coalesce(sum(l.points_delta),0) from public.tlt_participants p join public.leaderboard_consents c on c.club_id=p.club_id and c.participant_id=p.id and c.opted_in
    left join public.points_ledger l on l.club_id=p.club_id and l.participant_id=p.id and l.awarded_on between first_day and last_day
    where p.club_id=target_club and p.consent_state='confirmed' and p.status='active' and (selected_level is null or p.current_level=selected_level) and (period<>'season' or p.season_id=target_season)
    group by p.id,p.public_alias,p.current_level order by coalesce(sum(l.points_delta),0) desc,p.public_alias limit 100;
end; $$;
create function public.create_badge(target_club uuid,badge_name text,badge_criteria text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.has_club_role(target_club,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.badge_definitions(club_id,name,criteria,approved_by) values(target_club,badge_name,badge_criteria,auth.uid()) returning id into result; return result;
end; $$;
create function public.award_badge(target_participant uuid,target_badge uuid,award_reason text) returns void language plpgsql security definer set search_path='' as $$
declare p public.tlt_participants;
begin
  select * into p from public.tlt_participants where id=target_participant for update;
  if not found or not public.can_access_participant(p.club_id,p.id,true) or p.profile_id=auth.uid() then raise exception 'Not authorized or self-award' using errcode='42501'; end if;
  if p.consent_state<>'confirmed' then raise exception 'Consent required' using errcode='23514'; end if;
  insert into public.badge_awards(club_id,participant_id,badge_id,awarded_by,reason) values(p.club_id,p.id,target_badge,auth.uid(),award_reason);
end; $$;
create function public.revoke_badge(target_award uuid,explanation text) returns void language plpgsql security definer set search_path='' as $$
declare a public.badge_awards;
begin
  select * into a from public.badge_awards where id=target_award for update;
  if not found or not public.has_club_role(a.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if a.revoked_at is not null or explanation is null or length(trim(explanation)) not between 1 and 1000 then raise exception 'Revocation explanation required' using errcode='23514'; end if;
  update public.badge_awards set revoked_by=auth.uid(),revoked_at=now(),revoke_reason=explanation where id=a.id;
end; $$;
revoke all on function public.configure_recognition(uuid,integer,boolean),public.create_point_rule(uuid,text,text,text,integer,integer,integer,text),public.set_point_rule_status(uuid,text),public.award_points(uuid,uuid,uuid,text,uuid,text),public.reverse_points(uuid,uuid,text),public.set_leaderboard_consent(uuid,boolean,boolean),public.private_leaderboard(uuid,text,integer,uuid),public.create_badge(uuid,text,text),public.award_badge(uuid,uuid,text),public.revoke_badge(uuid,text) from public,anon,authenticated;
grant execute on function public.configure_recognition(uuid,integer,boolean),public.create_point_rule(uuid,text,text,text,integer,integer,integer,text),public.set_point_rule_status(uuid,text),public.award_points(uuid,uuid,uuid,text,uuid,text),public.reverse_points(uuid,uuid,text),public.set_leaderboard_consent(uuid,boolean,boolean),public.private_leaderboard(uuid,text,integer,uuid),public.create_badge(uuid,text,text),public.award_badge(uuid,uuid,text),public.revoke_badge(uuid,text) to authenticated;
