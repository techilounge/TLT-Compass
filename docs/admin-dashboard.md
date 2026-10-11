# Club administration

The authenticated club workspace now links to `/workspace/<club-id>/admin` for directors and coordinators. The dedicated Admin Dashboard presents setup guidance, club and curriculum forms, seasons, and scoped memberships. Setup actions return to the dashboard when submitted there; other workspace actions keep their original return path. Return destinations are fixed local routes.

Server-rendered administration checks the effective club roles before loading administration data. Member role mutations require director access, validate input, and call the existing set_member_role RPC. Database policy enforces adult eligibility and MFA, prevents changes to the actor's own roles, protects the final eligible director, and audits membership changes. Coordinators cannot use the role-change form or its server action. Invitations and eligibility review remain trusted operator operations; the dashboard states that limitation explicitly.

The club administrator counts display up to 100 rule versions/seasons and 500 membership rows. Large-club pagination, in-app invitations, eligibility review and account lifecycle controls remain future work. No real member role changes were made during implementation. User confirmed live password setup, authenticator setup, and entry into the club workspace; the full hosted task submission/review walkthrough is still pending.
