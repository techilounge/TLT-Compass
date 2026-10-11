create table public.question_imports (
 id uuid primary key,club_id uuid not null references public.clubs(id),file_name text not null check(length(file_name) between 1 and 200),source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),original_source text not null check(octet_length(original_source)<=524288),mapping jsonb not null,headers jsonb not null,candidates jsonb not null check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 1000 and octet_length(candidates::text)<=4194304),
 status text not null default 'preview' check(status in ('preview','published')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),published_by uuid references public.profiles(id),published_at timestamptz,
 unique(club_id,id),check((status='preview' and published_by is null and published_at is null) or(status='published' and published_by is not null and published_at is not null))
);
create table public.quiz_questions (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),prompt text not null check(length(trim(prompt)) between 5 and 2000),choices jsonb not null check(jsonb_typeof(choices)='array' and jsonb_array_length(choices) between 2 and 6),correct_index integer not null check(correct_index between 0 and 5),explanation text not null default '' check(length(explanation)<=3000),
 department_code text not null check(department_code in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')),level integer not null check(level between 1 and 4),difficulty text not null check(difficulty in ('introductory','developing','advanced')),source_reference text not null check(length(trim(source_reference)) between 1 and 500),
 status text not null default 'draft' check(status in ('draft','approved','retired')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,import_id uuid,source_row integer,
 unique(club_id,id),unique(import_id,source_row),foreign key(club_id,import_id) references public.question_imports(club_id,id),check(correct_index<jsonb_array_length(choices)),check(status='draft' or(reviewed_by is not null and reviewed_at is not null))
);
create unique index quiz_prompts_unique on public.quiz_questions(club_id,lower(trim(prompt))) where status<>'retired';
alter table public.question_imports enable row level security;alter table public.quiz_questions enable row level security;
create policy question_imports_staff on public.question_imports for select to authenticated using(public.is_club_staff(club_id));
create policy quiz_questions_staff on public.quiz_questions for select to authenticated using(public.is_club_staff(club_id));
revoke all on public.question_imports,public.quiz_questions from public,anon,authenticated;
grant select on public.question_imports,public.quiz_questions to authenticated;grant all on public.question_imports,public.quiz_questions to service_role;
create trigger audit_question_imports after insert or update on public.question_imports for each row execute function public.audit_change();
create trigger audit_quiz_questions after insert or update on public.quiz_questions for each row execute function public.audit_change();
create function public.validate_quiz_question(payload jsonb) returns void language plpgsql set search_path='' as $$
declare choice jsonb;
begin
 if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'choices') is distinct from 'array' or jsonb_array_length(payload->'choices') not between 2 and 6 then raise exception 'Invalid question schema' using errcode='23514';end if;
 for choice in select value from jsonb_array_elements(payload->'choices') loop if jsonb_typeof(choice)<>'string' or length(trim(choice#>>'{}')) not between 1 and 500 then raise exception 'Invalid answer choice' using errcode='23514';end if;end loop;
 if (select count(distinct lower(trim(value))) from jsonb_array_elements_text(payload->'choices'))<>jsonb_array_length(payload->'choices') or (payload->>'correct_index')::integer not between 0 and jsonb_array_length(payload->'choices')-1 then raise exception 'Distinct choices and valid correct answer required' using errcode='23514';end if;
end; $$;
create function public.save_question_import(request_id uuid,target_club uuid,source_name text,source_hash text,source_text text,column_mapping jsonb,source_headers jsonb,parsed_candidates jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.question_imports;
begin
 if not public.is_club_staff(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into existing from public.question_imports where id=request_id;
 if found then if existing.club_id=target_club and existing.created_by=auth.uid() and existing.source_sha256=source_hash and existing.mapping=column_mapping and existing.candidates=parsed_candidates then return existing.id;end if;raise exception 'Request ID used' using errcode='23514';end if;
 insert into public.question_imports(id,club_id,file_name,source_sha256,original_source,mapping,headers,candidates,created_by) values(request_id,target_club,source_name,source_hash,source_text,column_mapping,source_headers,parsed_candidates,auth.uid());return request_id;
end; $$;
create function public.publish_question_import(target_import uuid,selected_rows integer[],reviewed boolean) returns integer language plpgsql security definer set search_path='' as $$
declare job public.question_imports;idx integer;candidate jsonb;q jsonb;total integer:=0;
begin
 select * into job from public.question_imports where id=target_import;
 if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 perform 1 from public.clubs where id=job.club_id for update;select * into job from public.question_imports where id=target_import for update;
 if job.status='published' then return(select count(*)::integer from public.quiz_questions where import_id=job.id);end if;
 if reviewed is distinct from true or selected_rows is null or cardinality(selected_rows) not between 1 and 1000 then raise exception 'Review and select questions' using errcode='23514';end if;
 foreach idx in array selected_rows loop
  if idx is null or idx<0 or idx>=jsonb_array_length(job.candidates) then raise exception 'Question row unavailable' using errcode='23514';end if;
  candidate:=job.candidates->idx;q:=candidate->'question';if jsonb_typeof(candidate->'errors') is distinct from 'array' or jsonb_array_length(candidate->'errors')<>0 then raise exception 'Invalid question row' using errcode='23514';end if;
  perform public.validate_quiz_question(q);
  insert into public.quiz_questions(club_id,prompt,choices,correct_index,explanation,department_code,level,difficulty,source_reference,status,created_by,reviewed_by,reviewed_at,import_id,source_row) values(job.club_id,q->>'prompt',q->'choices',(q->>'correct_index')::integer,coalesce(q->>'explanation',''),q->>'department_code',(q->>'level')::integer,q->>'difficulty',q->>'source_reference','approved',job.created_by,auth.uid(),now(),job.id,(candidate->>'row')::integer);total:=total+1;
 end loop;
 update public.question_imports set status='published',published_by=auth.uid(),published_at=now() where id=job.id;return total;
end; $$;
revoke all on function public.validate_quiz_question(jsonb),public.save_question_import(uuid,uuid,text,text,text,jsonb,jsonb,jsonb),public.publish_question_import(uuid,integer[],boolean) from public,anon,authenticated;
grant execute on function public.save_question_import(uuid,uuid,text,text,text,jsonb,jsonb,jsonb),public.publish_question_import(uuid,integer[],boolean) to authenticated;
