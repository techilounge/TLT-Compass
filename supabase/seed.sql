-- Synthetic local sandbox. These identities have no passwords and cannot sign in.
insert into public.clubs(id,name) values
('10000000-0000-4000-8000-000000000001','North Star Sandbox'),
('10000000-0000-4000-8000-000000000002','Cedar Grove Sandbox');
insert into auth.users(id,email) values
('20000000-0000-4000-8000-000000000001','director.north@example.invalid'),
('20000000-0000-4000-8000-000000000002','director.cedar@example.invalid'),
('20000000-0000-4000-8000-000000000003','mentor.north@example.invalid'),
('20000000-0000-4000-8000-000000000004','participant.north@example.invalid'),
('20000000-0000-4000-8000-000000000005','outsider@example.invalid');
insert into public.staff_eligibility(club_id,profile_id,eligible,reviewed_at) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true,now()),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',true,now()),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',true,now());
insert into public.club_memberships(club_id,profile_id,role) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','director'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','director'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','primary_mentor'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','participant');
-- Nonofficial draft rules. Director approval is exercised explicitly in tests.
insert into public.program_rule_sets(id,club_id,version,source_title) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','sandbox-v1','Synthetic fixture — not an official curriculum'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','sandbox-v1','Synthetic fixture — not an official curriculum');
insert into public.program_requirements(id,club_id,rule_set_id,level,department_code,requirement_type,description,source_page,source_section) values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'outreach','required','Synthetic exercise: outline a supervised service activity.','fixture','Testing only'),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',1,'outreach','required','Synthetic exercise for the second club.','fixture','Testing only');
insert into public.seasons(id,club_id,name,starts_on,ends_on,rule_set_id) values
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic season',current_date-90,current_date+180,'30000000-0000-4000-8000-000000000001'),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic season',current_date-90,current_date+180,'30000000-0000-4000-8000-000000000002');
insert into public.tlt_participants(id,club_id,season_id,profile_id,public_alias,grade_level,consent_state,registration_confirmed,prior_achievement_confirmed,recommendations_received,recent_attendance,probation_started_on) values
('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Trailblazer Demo',9,'confirmed',true,true,3,90,current_date-61),
('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',null,'Cedar Demo',9,'pending',false,false,0,null,null);
