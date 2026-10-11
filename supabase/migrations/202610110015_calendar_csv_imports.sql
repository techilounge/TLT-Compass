create table public.calendar_imports (
  id uuid primary key,club_id uuid not null references public.clubs(id),file_name text not null check(length(file_name) between 1 and 200),
  source_kind text not null default 'csv' check(source_kind in ('csv','pdf')),source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
  original_source text not null check(octet_length(original_source)<=1048576),mapping jsonb not null,candidates jsonb not null,
  status text not null default 'preview' check(status in ('preview','published','rolled_back')),revision integer not null default 1,
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),published_by uuid references public.profiles(id),published_at timestamptz,
  unique(club_id,id),check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 500 and octet_length(candidates::text)<=4194304)
);
create table public.calendar_import_events (
  club_id uuid not null references public.clubs(id),import_id uuid not null,event_id uuid not null,source_row integer not null,
  primary key(club_id,import_id,event_id),foreign key(club_id,import_id) references public.calendar_imports(club_id,id),foreign key(club_id,event_id) references public.calendar_events(club_id,id)
);
alter table public.calendar_imports enable row level security;
alter table public.calendar_import_events enable row level security;
create policy calendar_imports_read on public.calendar_imports for select to authenticated using(public.can_manage_program(club_id));
create policy calendar_import_events_read on public.calendar_import_events for select to authenticated using(public.can_manage_program(club_id));
revoke all on public.calendar_imports,public.calendar_import_events from public,anon,authenticated;
grant select on public.calendar_imports,public.calendar_import_events to authenticated;
grant all on public.calendar_imports,public.calendar_import_events to service_role;
create trigger audit_calendar_imports after insert or update on public.calendar_imports for each row execute function public.audit_change();
create function public.create_calendar_import(request_id uuid,target_club uuid,source_name text,source_hash text,source_text text,column_mapping jsonb,parsed_candidates jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.calendar_imports;
begin
  if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into existing from public.calendar_imports where id=request_id;
  if found then
    if existing.club_id=target_club and existing.created_by=auth.uid() and existing.source_sha256=source_hash and existing.mapping=column_mapping and existing.candidates=parsed_candidates then return existing.id; end if;
    raise exception 'Request ID already used' using errcode='23514'; end if;
  insert into public.calendar_imports(id,club_id,file_name,source_sha256,original_source,mapping,candidates,created_by) values(request_id,target_club,source_name,source_hash,source_text,column_mapping,parsed_candidates,auth.uid());return request_id;
end; $$;
create function public.edit_calendar_import_row(target_import uuid,row_index integer,expected_revision integer,event_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare job public.calendar_imports;candidate jsonb;
begin
  select * into job from public.calendar_imports where id=target_import for update;
  if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if job.status<>'preview' or job.revision<>expected_revision or row_index is null or row_index<0 or row_index>=jsonb_array_length(job.candidates) then raise exception 'Import changed or row unavailable' using errcode='23514'; end if;
  perform public.validate_calendar_payload(event_payload);
  candidate:=job.candidates->row_index;
  candidate:=candidate||jsonb_build_object('payload',event_payload,'errors','[]'::jsonb,'warnings',jsonb_build_array('Edited by authorized staff; verify source row before publishing.'));
  update public.calendar_imports set candidates=jsonb_set(candidates,array[row_index::text],candidate),revision=revision+1 where id=job.id;
  insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details) values(job.club_id,auth.uid(),'calendar_import_edit','calendar_imports',job.id::text,jsonb_build_object('row_index',row_index,'previous_revision',job.revision));
end; $$;
create function public.publish_calendar_import(target_import uuid,expected_revision integer,selected_rows integer[],conflicts_reviewed boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare job public.calendar_imports;idx integer;candidate jsonb;payload jsonb;draft_id uuid;new_event uuid;total integer:=0;
begin
  select * into job from public.calendar_imports where id=target_import;
  if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=job.club_id for update;
  select * into job from public.calendar_imports where id=target_import for update;
  if job.status='published' then return (select count(*)::integer from public.calendar_import_events where import_id=job.id and club_id=job.club_id); end if;
  if job.status<>'preview' or job.revision<>expected_revision or cardinality(selected_rows) not between 1 and 500 or selected_rows is null or conflicts_reviewed is distinct from true then raise exception 'Select and review import rows before publishing' using errcode='23514'; end if;
  foreach idx in array selected_rows loop
    if idx is null or idx<0 or idx>=jsonb_array_length(job.candidates) then raise exception 'Row unavailable' using errcode='23514'; end if;
    candidate:=job.candidates->idx;payload:=candidate->'payload';
    if jsonb_typeof(candidate->'errors') is distinct from 'array' or jsonb_array_length(candidate->'errors')>0 then raise exception 'Correct or deselect invalid rows' using errcode='23514'; end if;
    perform public.validate_calendar_payload(payload);
    if exists(select 1 from public.calendar_occurrences o join public.calendar_events e on e.club_id=o.club_id and e.id=o.event_id cross join lateral jsonb_array_elements(payload->'occurrences') x
      where o.club_id=job.club_id and o.status='scheduled' and e.status='published' and lower(trim(e.title))=lower(trim(payload->>'title')) and o.starts_at=(x->>'starts_at')::timestamptz and o.ends_at=(x->>'ends_at')::timestamptz) then raise exception 'Duplicate published event; deselect or correct row' using errcode='23514'; end if;
    draft_id:=gen_random_uuid();
    insert into public.calendar_drafts(id,club_id,payload,created_by,source_kind,source_reference) values(draft_id,job.club_id,payload,auth.uid(),job.source_kind,left(job.file_name||': row '||(candidate->>'source_row'),500));
    new_event:=public.publish_calendar_draft(draft_id,conflicts_reviewed);
    insert into public.calendar_import_events(club_id,import_id,event_id,source_row) values(job.club_id,job.id,new_event,(candidate->>'source_row')::integer);
    total:=total+1;
  end loop;
  update public.calendar_imports set status='published',revision=revision+1,published_by=auth.uid(),published_at=now() where id=job.id;
  return total;
end; $$;
create function public.rollback_calendar_import(target_import uuid) returns void language plpgsql security definer set search_path='' as $$
declare job public.calendar_imports;e public.calendar_events;
begin
  select * into job from public.calendar_imports where id=target_import;
  if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.clubs where id=job.club_id for update;
  select * into job from public.calendar_imports where id=target_import for update;
  if job.status<>'published' then raise exception 'Published import required' using errcode='23514'; end if;
  if exists(select 1 from public.calendar_import_events i join public.calendar_events ce on ce.club_id=i.club_id and ce.id=i.event_id where i.import_id=job.id and i.club_id=job.club_id and (ce.revision<>1 or ce.status<>'published')) then raise exception 'Imported events changed; reconcile them individually' using errcode='23514'; end if;
  for e in select ce.* from public.calendar_events ce join public.calendar_import_events i on i.club_id=ce.club_id and i.event_id=ce.id where i.import_id=job.id and i.club_id=job.club_id loop perform public.cancel_calendar_event(e.id,e.revision);end loop;
  update public.calendar_imports set status='rolled_back',revision=revision+1 where id=job.id;
end; $$;
revoke all on function public.create_calendar_import(uuid,uuid,text,text,text,jsonb,jsonb),public.edit_calendar_import_row(uuid,integer,integer,jsonb),public.publish_calendar_import(uuid,integer,integer[],boolean),public.rollback_calendar_import(uuid) from public,anon,authenticated;
grant execute on function public.create_calendar_import(uuid,uuid,text,text,text,jsonb,jsonb),public.edit_calendar_import_row(uuid,integer,integer,jsonb),public.publish_calendar_import(uuid,integer,integer[],boolean),public.rollback_calendar_import(uuid) to authenticated;
