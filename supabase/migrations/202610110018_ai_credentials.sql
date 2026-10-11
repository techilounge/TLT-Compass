create table public.ai_credentials (
  club_id uuid not null references public.clubs(id),provider_id uuid primary key,
  encrypted_value text not null check(length(encrypted_value) between 60 and 12000),last_four text not null check(length(last_four)=4),
  updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  foreign key(club_id,provider_id) references public.ai_providers(club_id,id)
);
alter table public.ai_credentials enable row level security;
revoke all on public.ai_credentials from public,anon,authenticated,tlt_ai_runtime;
grant all on public.ai_credentials to service_role;
alter table public.ai_providers add column credential_last_four text check(length(credential_last_four)=4);
revoke update on public.ai_providers from authenticated;
grant update(name,provider_type,base_url,credential_secret_ref,priority,enabled,privacy_approved) on public.ai_providers to authenticated;
create function public.store_ai_credential(target_provider uuid,ciphertext text,last_four text) returns void language plpgsql security definer set search_path='' as $$
declare p public.ai_providers;
begin
  select * into p from public.ai_providers where id=target_provider;
  if not found or not public.can_configure_ai(p.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if ciphertext !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or length(ciphertext) not between 60 and 12000 or length(last_four)<>4 then raise exception 'Encrypted credential required' using errcode='23514'; end if;
  insert into public.ai_credentials(club_id,provider_id,encrypted_value,last_four,updated_by) values(p.club_id,p.id,ciphertext,last_four,auth.uid()) on conflict(provider_id) do update set encrypted_value=excluded.encrypted_value,last_four=excluded.last_four,updated_by=excluded.updated_by,updated_at=now();
  update public.ai_providers set credential_last_four=last_four where id=p.id;
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details) values(p.club_id,auth.uid(),'ai_credential_rotated','ai_providers',p.id::text,'{"reauthentication":"server_password_check_required"}'::jsonb);
end; $$;
create function public.read_ai_credential(target_club uuid,target_provider uuid) returns text language plpgsql security definer set search_path='' as $$
begin
  if not (session_user='tlt_ai_runtime' or current_setting('role',true)='tlt_ai_runtime') or not public.is_club_staff(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  return (select encrypted_value from public.ai_credentials where club_id=target_club and provider_id=target_provider);
end; $$;
revoke all on function public.store_ai_credential(uuid,text,text),public.read_ai_credential(uuid,uuid) from public,anon,authenticated;
grant execute on function public.store_ai_credential(uuid,text,text) to tlt_ai_runtime;
grant execute on function public.read_ai_credential(uuid,uuid) to tlt_ai_runtime;
