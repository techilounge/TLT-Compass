# Browser security and installation

The request proxy supplies a fresh Content Security Policy nonce to Next.js and the response. Production scripts require the nonce, with strict-dynamic for framework loading. Production policy excludes unsafe-inline and unsafe-eval, blocks objects and framing, restricts form targets and permits connections only to the configured Supabase origin and the app. Development permits the additional behavior needed by Next.js tooling.

HTML is dynamically rendered and marked private, no-store. This trades shared HTML caching for session isolation and per-request nonces. Static framework assets remain outside this proxy matcher. Auth refresh preserves response cookies and the security headers.

The web manifest and generated 192/512 pixel icons provide installation metadata. There is no service worker and no offline caching of private records. Installation on target devices, HTTPS deployment, appropriate transport security headers and authenticated accessibility review remain release acceptance work.

Browser checks verify nonce uniqueness, framework hydration, absence of CSP console violations on the tested public pages, manifest contents and PNG icon responses. These checks do not establish security of every authenticated workflow.

The browser test server explicitly clears Supabase and AI runtime configuration. This keeps credential-free fail-closed checks independent of a developer's ignored staging environment. Production client assets must still be built with the intended deployment configuration; local test results do not replace hosted acceptance.
