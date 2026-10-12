create table public.ai_task_proposals (
 id uuid primary key,club_id uuid not null references public.clubs(id),participant_id uuid not null,requirement_id uuid not null,
 payload jsonb not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,result_task_id uuid,
 foreign key(club_id,participant_id) references public.tlt_participants(club_id,id),foreign key(club_id,requirement_id) references public.program_requirements(club_id,id),foreign key(club_id,result_task_id) references public.tasks(club_id,id),
 check((status='pending' and reviewed_by is null and reviewed_at is null and result_task_id is null) or (status='rejected' and reviewed_by is not null and reviewed_at is not null and result_task_id is null) or (status='approved' and reviewed_by is not null and reviewed_at is not null and result_task_id is not null))
);
alter table public.ai_task_proposals enable row level security;
create policy ai_task_proposals_read on public.ai_task_proposals for select to authenticated using(public.can_manage_program(club_id));
revoke all on public.ai_task_proposals from public,anon,authenticated;grant select on public.ai_task_proposals to authenticated;grant all on public.ai_task_proposals to service_role;
create trigger audit_ai_task_proposals after insert or update on public.ai_task_proposals for each row execute function public.audit_change();
create function public.propose_ai_task(request_id uuid,target_club uuid,target_participant uuid,target_requirement uuid,task_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.ai_task_proposals;
begin
 if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 if not exists(select 1 from public.tlt_participants p join public.seasons s on s.club_id=p.club_id and s.id=p.season_id join public.program_requirements r on r.club_id=s.club_id and r.rule_set_id=s.rule_set_id join public.program_rule_sets rs on rs.id=r.rule_set_id and rs.club_id=r.club_id where p.club_id=target_club and p.id=target_participant and r.id=target_requirement and r.level=p.current_level and rs.status='approved' and p.status='active' and p.consent_state='confirmed') then raise exception 'Active participant and approved current-level requirement required' using errcode='23514';end if;
 if jsonb_typeof(task_payload) is distinct from 'object' or task_payload-array['title','instructions','due_on']<>'{}'::jsonb or jsonb_typeof(task_payload->'title') is distinct from 'string' or length(trim(task_payload->>'title')) not between 1 and 160 or jsonb_typeof(task_payload->'instructions') is distinct from 'string' or length(trim(task_payload->>'instructions')) not between 1 and 5000 or not task_payload ? 'due_on' or (task_payload->'due_on'<>'null'::jsonb and ((task_payload->>'due_on') !~ '^\d{4}-\d{2}-\d{2}$' or (task_payload->>'due_on')::date is null)) then raise exception 'Invalid task proposal' using errcode='23514';end if;
 select * into existing from public.ai_task_proposals where id=request_id;
 if found then if existing.club_id=target_club and existing.created_by=auth.uid() and existing.participant_id=target_participant and existing.requirement_id=target_requirement and existing.payload=task_payload then return existing.id;end if;raise exception 'Request ID already used' using errcode='23514';end if;
 insert into public.ai_task_proposals(id,club_id,participant_id,requirement_id,payload,created_by) values(request_id,target_club,target_participant,target_requirement,task_payload,auth.uid());return request_id;
end; $$;
create function public.review_ai_task_proposal(target_proposal uuid,approve boolean,exact_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare proposal public.ai_task_proposals;task_id uuid;
begin
 select * into proposal from public.ai_task_proposals where id=target_proposal for update;
 if not found or not public.can_manage_program(proposal.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 if exact_payload is distinct from proposal.payload or approve is null then raise exception 'Review exact proposed changes' using errcode='23514';end if;
 if proposal.status='approved' and approve then return proposal.result_task_id;end if;
 if proposal.status<>'pending' then raise exception 'Proposal already reviewed' using errcode='23514';end if;
 if approve then task_id:=public.create_task_draft(proposal.participant_id,proposal.requirement_id,proposal.payload->>'title',proposal.payload->>'instructions',(proposal.payload->>'due_on')::date);end if;
 update public.ai_task_proposals set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),result_task_id=task_id where id=proposal.id;return task_id;
end; $$;
revoke all on function public.propose_ai_task(uuid,uuid,uuid,uuid,jsonb),public.review_ai_task_proposal(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.propose_ai_task(uuid,uuid,uuid,uuid,jsonb),public.review_ai_task_proposal(uuid,boolean,jsonb) to authenticated;
