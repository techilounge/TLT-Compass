create table public.requirement_catalog_imports (
 club_id uuid not null references public.clubs(id),rule_set_id uuid not null,level integer not null check(level between 1 and 4),department_code text not null,catalog_version text not null,
 imported_by uuid not null references public.profiles(id),imported_at timestamptz not null default now(),primary key(club_id,rule_set_id,level,department_code,catalog_version),foreign key(club_id,rule_set_id) references public.program_rule_sets(club_id,id)
);
alter table public.requirement_catalog_imports enable row level security;
create policy catalog_imports_read on public.requirement_catalog_imports for select to authenticated using(public.can_manage_program(club_id));
revoke all on public.requirement_catalog_imports from public,anon,authenticated;grant select on public.requirement_catalog_imports to authenticated;grant all on public.requirement_catalog_imports to service_role;
create function public.import_requirement_catalog(target_club uuid,target_rule uuid,target_level integer,target_department text,catalog_version text,items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare r public.program_rule_sets;item jsonb;total integer:=0;
begin
 if not public.can_manage_program(target_club) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into r from public.program_rule_sets where club_id=target_club and id=target_rule for update;
 if not found or r.status<>'draft' then raise exception 'Draft rule version required' using errcode='23514';end if;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 16 or length(trim(catalog_version)) not between 1 and 120 then raise exception 'Bounded catalog required' using errcode='23514';end if;
 insert into public.requirement_catalog_imports(club_id,rule_set_id,level,department_code,catalog_version,imported_by) values(target_club,target_rule,target_level,target_department,catalog_version,auth.uid()) on conflict do nothing;
 if not found then return 0;end if;
 for item in select value from jsonb_array_elements(items) loop
  if item->>'department_code' is distinct from target_department then raise exception 'Department mismatch' using errcode='23514';end if;
  insert into public.program_requirements(club_id,rule_set_id,level,department_code,requirement_type,description,source_page,source_section) values(target_club,target_rule,target_level,target_department,item->>'requirement_type',item->>'description',item->>'source_page',item->>'source_section');total:=total+1;
 end loop;
 insert into public.audit_logs(club_id,actor_profile_id,action,resource_type,resource_id,details) values(target_club,auth.uid(),'reference_catalog_import','program_rule_sets',target_rule::text,jsonb_build_object('catalog_version',catalog_version,'level',target_level,'department',target_department,'count',total));return total;
end; $$;
revoke all on function public.import_requirement_catalog(uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;grant execute on function public.import_requirement_catalog(uuid,uuid,integer,text,text,jsonb) to authenticated;
