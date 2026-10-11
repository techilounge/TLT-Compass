create table public.pdf_calendar_jobs (
  id uuid primary key,club_id uuid not null references public.clubs(id),file_name text not null check(length(file_name) between 1 and 200),
  source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),source_base64 text not null check(octet_length(source_base64)<=7340032),timezone text not null,
  status text not null default 'queued' check(status in ('queued','processing','needs_review','failed')),attempts integer not null default 0 check(attempts between 0 and 3),
  lease_token uuid,lease_expires_at timestamptz,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),completed_at timestamptz,
  import_id uuid,error_code text check(error_code in ('extraction_failed','resource_limit','manual_review_required')),unique(club_id,id),foreign key(club_id,import_id) references public.calendar_imports(club_id,id)
);
alter table public.pdf_calendar_jobs enable row level security;
create policy pdf_jobs_read on public.pdf_calendar_jobs for select to authenticated using(public.can_manage_program(club_id));
revoke all on public.pdf_calendar_jobs from public,anon,authenticated;
grant select(id,club_id,file_name,source_sha256,timezone,status,attempts,created_by,created_at,completed_at,import_id,error_code) on public.pdf_calendar_jobs to authenticated;
grant all on public.pdf_calendar_jobs to service_role;
create trigger audit_pdf_jobs after insert or update on public.pdf_calendar_jobs for each row execute function public.audit_change();
create function public.enqueue_pdf_calendar(request_id uuid,target_club uuid,source_name text,source_hash text,file_base64 text,event_timezone text)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.pdf_calendar_jobs;
begin
  if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=event_timezone) or substring(decode(file_base64,'base64') from 1 for 5)<>convert_to('%PDF-','UTF8') or octet_length(decode(file_base64,'base64'))>5242880 then raise exception 'Valid bounded PDF and timezone required' using errcode='23514'; end if;
  select * into existing from public.pdf_calendar_jobs where id=request_id;
  if found then if existing.club_id=target_club and existing.created_by=auth.uid() and existing.source_sha256=source_hash and existing.timezone=event_timezone then return existing.id;end if;raise exception 'Request ID already used' using errcode='23514';end if;
  insert into public.pdf_calendar_jobs(id,club_id,file_name,source_sha256,source_base64,timezone,created_by) values(request_id,target_club,source_name,source_hash,file_base64,event_timezone,auth.uid());return request_id;
end; $$;
create function public.claim_pdf_calendar(target_job uuid)
returns table(source_base64 text,timezone text,lease_token uuid) language plpgsql security definer set search_path='' as $$
declare job public.pdf_calendar_jobs;token uuid:=gen_random_uuid();
begin
  select * into job from public.pdf_calendar_jobs where id=target_job for update;
  if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if job.attempts>=3 or not (job.status in ('queued','failed') or (job.status='processing' and job.lease_expires_at<now())) then return;end if;
  update public.pdf_calendar_jobs set status='processing',attempts=attempts+1,lease_token=token,lease_expires_at=now()+interval '60 seconds',error_code=null where id=job.id;
  return query select job.source_base64,job.timezone,token;
end; $$;
create function public.finish_pdf_calendar(target_job uuid,token uuid,parsed_candidates jsonb,extraction_error text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare job public.pdf_calendar_jobs;
begin
  select * into job from public.pdf_calendar_jobs where id=target_job for update;
  if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if job.status<>'processing' or job.lease_token is distinct from token or job.lease_expires_at<now() then raise exception 'Extraction lease expired' using errcode='23514'; end if;
  if extraction_error is not null then update public.pdf_calendar_jobs set status='failed',error_code='extraction_failed',lease_token=null,lease_expires_at=null where id=job.id;return null;end if;
  insert into public.calendar_imports(id,club_id,file_name,source_kind,source_sha256,original_source,mapping,candidates,created_by)
    values(job.id,job.club_id,job.file_name,'pdf',job.source_sha256,'PDF original retained privately in durable extraction job',jsonb_build_object('timezone',job.timezone,'method','deterministic_text'),parsed_candidates,auth.uid());
  update public.pdf_calendar_jobs set status='needs_review',completed_at=now(),import_id=job.id,lease_token=null,lease_expires_at=null where id=job.id;return job.id;
end; $$;
revoke all on function public.enqueue_pdf_calendar(uuid,uuid,text,text,text,text),public.claim_pdf_calendar(uuid),public.finish_pdf_calendar(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_pdf_calendar(uuid,uuid,text,text,text,text),public.claim_pdf_calendar(uuid),public.finish_pdf_calendar(uuid,uuid,jsonb,text) to authenticated;
