-- Preserve source-page provenance when reviewed PDF candidates become events.
create or replace function public.publish_calendar_import(target_import uuid,expected_revision integer,selected_rows integer[],conflicts_reviewed boolean)
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
    insert into public.calendar_drafts(id,club_id,payload,created_by,source_kind,source_reference) values(draft_id,job.club_id,payload,auth.uid(),job.source_kind,left(job.file_name||case when job.source_kind='pdf' then ': PDF p. '||coalesce(candidate->>'source_page','unknown')||', extracted row ' else ': row ' end||(candidate->>'source_row'),500));
    new_event:=public.publish_calendar_draft(draft_id,conflicts_reviewed);
    insert into public.calendar_import_events(club_id,import_id,event_id,source_row) values(job.club_id,job.id,new_event,(candidate->>'source_row')::integer);
    total:=total+1;
  end loop;
  update public.calendar_imports set status='published',revision=revision+1,published_by=auth.uid(),published_at=now() where id=job.id;
  return total;
end; $$;
