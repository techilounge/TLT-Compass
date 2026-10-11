alter table public.question_imports add column revision integer not null default 0;
create function public.edit_question_candidate(target_import uuid,row_index integer,expected_revision integer,payload jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare job public.question_imports;candidate jsonb;
begin
 select * into job from public.question_imports where id=target_import;
 if not found or not public.can_manage_program(job.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 perform 1 from public.clubs where id=job.club_id for update;
 select * into job from public.question_imports where id=target_import for update;
 if job.status<>'preview' or job.revision is distinct from expected_revision then raise exception 'Preview changed; reload' using errcode='23514';end if;
 if row_index is null or row_index<0 or row_index>=jsonb_array_length(job.candidates) then raise exception 'Row unavailable' using errcode='23514';end if;
 perform public.validate_quiz_question(payload);
 if jsonb_typeof(payload->'correct_index') is distinct from 'number' or coalesce(payload->>'correct_index','') !~ '^[0-5]$' then raise exception 'Correct answer required' using errcode='23514';end if;
 if length(trim(coalesce(payload->>'prompt',''))) not between 5 and 2000
 or length(coalesce(payload->>'explanation',''))>3000
 or coalesce(payload->>'department_code','') not in ('administrative','outreach','teaching','activities','records','counseling','special_1','special_2')
 or coalesce((payload->>'level')::integer,0) not between 1 and 4
 or coalesce(payload->>'difficulty','') not in ('introductory','developing','advanced')
 or length(trim(coalesce(payload->>'source_reference',''))) not between 1 and 500 then raise exception 'Question enrichment required' using errcode='23514';end if;
 candidate:=job.candidates->row_index;
 candidate:=candidate||jsonb_build_object('question',payload,'errors','[]'::jsonb,'edited_by',auth.uid(),'edited_at',now());
 update public.question_imports set candidates=jsonb_set(candidates,array[row_index::text],candidate),revision=revision+1 where id=job.id;
 return job.revision+1;
end; $$;
revoke all on function public.edit_question_candidate(uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.edit_question_candidate(uuid,integer,integer,jsonb) to authenticated;
