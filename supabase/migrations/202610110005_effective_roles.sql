create function public.effective_club_roles(target_club uuid) returns setof public.club_role
language sql stable security definer set search_path='' as $$
  select role from unnest(enum_range(null::public.club_role)) as role
  where public.has_club_role(target_club,array[role]);
$$;
revoke all on function public.effective_club_roles(uuid) from public,anon,authenticated;
grant execute on function public.effective_club_roles(uuid) to authenticated;
