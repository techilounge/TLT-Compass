create table public.ai_proposals (
  id uuid primary key,club_id uuid not null references public.clubs(id),action text not null check(action='draft_event'),
  payload jsonb not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,result_draft_id uuid,
  foreign key(club_id,result_draft_id) references public.calendar_drafts(club_id,id),
  check((status='pending' and reviewed_by is null and reviewed_at is null and result_draft_id is null) or (status='rejected' and reviewed_by is not null and reviewed_at is not null and result_draft_id is null) or (status='approved' and reviewed_by is not null and reviewed_at is not null and result_draft_id is not null))
);
alter table public.ai_proposals enable row level security;
create policy ai_proposals_read on public.ai_proposals for select to authenticated using(public.can_manage_program(club_id));
revoke all on public.ai_proposals from public,anon,authenticated;
grant select on public.ai_proposals to authenticated;grant all on public.ai_proposals to service_role;
create trigger audit_ai_proposals after insert or update on public.ai_proposals for each row execute function public.audit_change();
create function public.propose_ai_event(request_id uuid,target_club uuid,event_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.ai_proposals;
begin
  if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
  perform public.validate_calendar_payload(event_payload);
  select * into existing from public.ai_proposals where id=request_id;
  if found then if existing.club_id=target_club and existing.created_by=auth.uid() and existing.payload=event_payload then return existing.id;end if;raise exception 'Request ID already used' using errcode='23514';end if;
  insert into public.ai_proposals(id,club_id,action,payload,created_by) values(request_id,target_club,'draft_event',event_payload,auth.uid());return request_id;
end; $$;
create function public.review_ai_event_proposal(target_proposal uuid,approve boolean,exact_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare proposal public.ai_proposals;draft_id uuid;
begin
  select * into proposal from public.ai_proposals where id=target_proposal for update;
  if not found or not public.can_manage_program(proposal.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
  if exact_payload is distinct from proposal.payload or approve is null then raise exception 'Review exact proposed changes' using errcode='23514';end if;
  if proposal.status='approved' and approve then return proposal.result_draft_id;end if;
  if proposal.status<>'pending' then raise exception 'Proposal already reviewed' using errcode='23514';end if;
  if approve then
    draft_id:=public.save_calendar_draft(gen_random_uuid(),proposal.club_id,proposal.payload,null,0);
    update public.calendar_drafts set source_reference='AI proposal '||proposal.id::text where id=draft_id;
  end if;
  update public.ai_proposals set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),result_draft_id=draft_id where id=proposal.id;return draft_id;
end; $$;
revoke all on function public.propose_ai_event(uuid,uuid,jsonb),public.review_ai_event_proposal(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.propose_ai_event(uuid,uuid,jsonb),public.review_ai_event_proposal(uuid,boolean,jsonb) to authenticated;
