-- Phase 0: trusted enrollment, tenant isolation, adult MFA, immutable audit.
create type public.club_role as enum ('director','coordinator','primary_mentor','operational_mentor','participant');
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default 'Member' check (length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.staff_eligibility (
  club_id uuid not null references public.clubs(id),
  profile_id uuid not null references public.profiles(id),
  eligible boolean not null default false,
  reviewed_at timestamptz,
  primary key (club_id,profile_id),
  check (not eligible or reviewed_at is not null)
);
create table public.club_memberships (
  club_id uuid not null references public.clubs(id),
  profile_id uuid not null references public.profiles(id),
  role public.club_role not null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  primary key (club_id,profile_id,role)
);
create index memberships_by_profile on public.club_memberships(profile_id,status,club_id);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  actor_profile_id uuid references public.profiles(id),
  action text not null,
  resource_type text not null,
  resource_id text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_by_club_time on public.audit_logs(club_id,occurred_at desc);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id); return new; end;
$$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.handle_new_user();
create function public.has_club_role(target_club uuid,allowed public.club_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_memberships m
    where m.club_id=target_club and m.profile_id=(select auth.uid()) and m.status='active' and m.role=any(allowed)
    and (m.role='participant' or ((select auth.jwt()->>'aal')='aal2' and exists (
      select 1 from public.staff_eligibility e where e.club_id=m.club_id and e.profile_id=m.profile_id and e.eligible
    )))
  );
$$;
create function public.is_club_staff(target_club uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_club_role(target_club,array['director','coordinator','primary_mentor','operational_mentor']::public.club_role[]);
$$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; previous_data jsonb; target_club uuid;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  target_club:=case when tg_table_name='clubs' then (row_data->>'id')::uuid else (row_data->>'club_id')::uuid end;
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details)
  values(target_club,auth.uid(),lower(tg_op),tg_table_name,coalesce(row_data->>'id',row_data->>'profile_id',target_club::text),
    jsonb_strip_nulls(jsonb_build_object('role',row_data->>'role','status',row_data->>'status','previous_status',previous_data->>'status','eligible',row_data->'eligible')));
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger audit_clubs after insert or update on public.clubs for each row execute function public.audit_change();
create trigger audit_memberships after insert or update or delete on public.club_memberships for each row execute function public.audit_change();
create trigger audit_eligibility after insert or update or delete on public.staff_eligibility for each row execute function public.audit_change();
create function public.reject_audit_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Audit records are immutable' using errcode='42501'; end;
$$;
create trigger immutable_audit before update or delete or truncate on public.audit_logs for each statement execute function public.reject_audit_mutation();
create function public.set_member_role(target_club uuid,target_profile uuid,target_role public.club_role,active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.clubs where id=target_club for update;
  if not public.has_club_role(target_club,array['director']::public.club_role[]) or target_profile=auth.uid() then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if active and target_role<>'participant' and not exists (
    select 1 from public.staff_eligibility where club_id=target_club and profile_id=target_profile and eligible
  ) then raise exception 'Adult eligibility required' using errcode='42501'; end if;
  if not active and target_role='director' and not exists (
    select 1 from public.club_memberships m join public.staff_eligibility e using(club_id,profile_id)
    where m.club_id=target_club and m.role='director' and m.status='active' and e.eligible and m.profile_id<>target_profile
  ) then raise exception 'A club needs an eligible director' using errcode='23514'; end if;
  insert into public.club_memberships(club_id,profile_id,role,status)
  values(target_club,target_profile,target_role,case when active then 'active' else 'revoked' end)
  on conflict(club_id,profile_id,role) do update set status=excluded.status;
end;
$$;
alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_eligibility enable row level security;
alter table public.club_memberships enable row level security;
alter table public.audit_logs enable row level security;
create policy club_read on public.clubs for select to authenticated using (
  public.has_club_role(id,array['director','coordinator','primary_mentor','operational_mentor','participant']::public.club_role[])
);
create policy club_update on public.clubs for update to authenticated using(public.has_club_role(id,array['director']::public.club_role[])) with check(public.has_club_role(id,array['director']::public.club_role[]));
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy membership_read on public.club_memberships for select to authenticated using(profile_id=auth.uid() or public.has_club_role(club_id,array['director','coordinator']::public.club_role[]));
create policy eligibility_read on public.staff_eligibility for select to authenticated using(profile_id=auth.uid() or public.has_club_role(club_id,array['director']::public.club_role[]));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_club_role(club_id,array['director']::public.club_role[]));
revoke all on public.clubs,public.profiles,public.staff_eligibility,public.club_memberships,public.audit_logs from anon,authenticated;
grant select on public.clubs,public.profiles,public.staff_eligibility,public.club_memberships,public.audit_logs to authenticated;
grant update(name,timezone) on public.clubs to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant all on public.clubs,public.profiles,public.staff_eligibility,public.club_memberships,public.audit_logs to service_role;
revoke all on function public.handle_new_user(),public.audit_change(),public.reject_audit_mutation(),public.has_club_role(uuid,public.club_role[]),public.is_club_staff(uuid),public.set_member_role(uuid,uuid,public.club_role,boolean) from public,anon,authenticated;
grant execute on function public.has_club_role(uuid,public.club_role[]),public.is_club_staff(uuid),public.set_member_role(uuid,uuid,public.club_role,boolean) to authenticated;
