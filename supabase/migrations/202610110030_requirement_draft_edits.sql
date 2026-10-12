alter table public.program_requirements add column draft_revision integer not null default 0 check(draft_revision>=0);
create table public.requirement_draft_revisions (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id), requirement_id uuid not null,
 revision integer not null, before_value jsonb not null, after_value jsonb not null, edited_by uuid not null references public.profiles(id), edited_at timestamptz not null default now(),
 foreign key(club_id,requirement_id) references public.program_requirements(club_id,id), unique(requirement_id,revision)
);
alter table public.requirement_draft_revisions enable row level security;
create policy requirement_revisions_read on public.requirement_draft_revisions for select to authenticated using(public.can_manage_program(club_id));
revoke all on public.requirement_draft_revisions from public,anon,authenticated;
grant select on public.requirement_draft_revisions to authenticated;
grant all on public.requirement_draft_revisions to service_role;
create function public.edit_draft_requirement(target_requirement uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare old_value public.program_requirements; new_value public.program_requirements; rule_status text;
begin
 select * into old_value from public.program_requirements where id=target_requirement;
 if not found or not public.can_manage_program(old_value.club_id) then raise exception 'Not authorized' using errcode='42501';end if;
 select status into rule_status from public.program_rule_sets where id=old_value.rule_set_id and club_id=old_value.club_id for update;
 if rule_status is distinct from 'draft' then raise exception 'Draft rule version required' using errcode='23514';end if;
 select * into old_value from public.program_requirements where id=target_requirement for update;
 if expected_revision is distinct from old_value.draft_revision then raise exception 'Draft changed; reload before editing' using errcode='40001';end if;
 if jsonb_typeof(payload) is distinct from 'object' or payload - array['level','department_code','requirement_type','description','source_page','source_section'] <> '{}'::jsonb then raise exception 'Invalid draft fields' using errcode='23514';end if;
 update public.program_requirements set level=(payload->>'level')::integer,department_code=payload->>'department_code',requirement_type=payload->>'requirement_type',description=trim(payload->>'description'),source_page=trim(payload->>'source_page'),source_section=trim(payload->>'source_section'),draft_revision=draft_revision+1 where id=target_requirement returning * into new_value;
 insert into public.requirement_draft_revisions(club_id,requirement_id,revision,before_value,after_value,edited_by) values(old_value.club_id,target_requirement,new_value.draft_revision,to_jsonb(old_value),to_jsonb(new_value),auth.uid());
end; $$;
revoke all on function public.edit_draft_requirement(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.edit_draft_requirement(uuid,integer,jsonb) to authenticated;
