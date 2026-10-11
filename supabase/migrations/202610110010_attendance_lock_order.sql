-- Match recording's participant-before-entry order during concurrent correction/review.
create or replace function public.verify_attendance(target_entry uuid,expected_recorded_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare e public.attendance_entries; p public.tlt_participants;
begin
  select p0.* into p from public.tlt_participants p0
    join public.attendance_entries e0 on e0.club_id=p0.club_id and e0.participant_id=p0.id
    where e0.id=target_entry for update of p0;
  select * into e from public.attendance_entries where id=target_entry for update;
  if not found or not public.has_club_role(e.club_id,array['director']::public.club_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p.profile_id=auth.uid() then raise exception 'No self-review' using errcode='42501'; end if;
  if p.consent_state<>'confirmed' or e.status<>'pending' or e.recorded_at is distinct from expected_recorded_at then
    raise exception 'Record changed, already verified, or consent withdrawn' using errcode='23514'; end if;
  update public.attendance_entries set status='verified',reviewed_by=auth.uid(),reviewed_at=now() where id=e.id;
end;
$$;
alter table public.attendance_entries add unique(club_id,id);
alter table public.attendance_entry_versions drop constraint attendance_entry_versions_entry_id_fkey;
alter table public.attendance_entry_versions add foreign key(club_id,entry_id) references public.attendance_entries(club_id,id);
