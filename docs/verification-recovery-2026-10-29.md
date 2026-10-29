# Liftory recovery — 2026-10-29

## Published repair

Dev frontend deployment dpl_3EKR9j3uTZCtX9ZS1yzashkLyTFP is READY and assigned to https://liftory-dev.vercel.app. It was uploaded from an isolated copy of b2554e0 plus the API proxy repair. Nine archived files from the previous Vercel deployment matched b2554e0 exactly, including the page and styles. The unfinished exercise-progress UI was not deployed.

The original Tailscale hostname did not change during the overnight restart. Public authoritative DNS was missing despite a healthy online Funnel; TLS-verified health requests through two ingress addresses succeeded. Re-advertisement and a temporary hostname change did not restore DNS; the original hostname and node identity were restored. A Cloudflare QuickTunnel attempt could not reach its provisioning API; its LaunchAgent was stopped and removed from login startup, and the newly installed cloudflared package was uninstalled.

The new Node API route resolves the normal hostname first, then uses explicitly configured server-only fallback IPs solely for DNS resolution failures. Host, SNI and normal certificate verification remain enabled. HTTP requests are not retried. Vercel API_INTERNAL_URL is unchanged; API_DNS_FALLBACK_IPS is configured only for the production target of the liftory-dev project. The separate real production project remains untouched. See tunnel.md for limits and removal of this temporary measure after DNS recovers.

## Verification

- Formatting, lint, TypeScript and the full build passed on Pro.
- Vitest: 41 passed, 17 database-dependent tests skipped because no test database was configured. Live data was not used for tests. Native tests: 63 passed.
- The built Next server successfully proxied the real HTTPS backend, health/session, unauthenticated records, Google initialization and Origin protection.
- At 16:56:41 UTC the public Vercel site returned health200 with backend version b2554e079e5f3440a8f135dea1d9da5b684e3600, session200 with Google enabled and no development identity, and unauthenticated records401.
- Public Google initialization returned200, the correct accounts.google.com destination and frontend callback, and a Secure/HttpOnly/SameSite=Lax host-only state cookie. Missing/untrusted Origin returned403 without cookies. API responses were private/no-store.
- A fresh Chrome session loaded the site200 without JavaScript errors, and clicking the Google button navigated to accounts.google.com. A completed interactive login was not performed.

## Subsequent host availability issue — resolved

Around16:58UTC Pro stopped accepting SSH; public API requests then timed out again. Air remained reachable. A Wake-on-LAN attempt did not immediately restore access. A later browser verification could not start because SSH was refused. The owner was asked to check that Pro is powered, on AC and awake with its lid open. This is separate from the repaired DNS dependency; do not report the whole service as currently healthy until Pro and public health are rechecked.

## Source and remaining work

Air worktree: ~/.local/share/liftory/recovery/source, branch fix/api-dns-fallback. Pro verification/deployment copy is at the same relative path. The repair is uncommitted and unpushed. Original Air feature/exercise-progress remains at b2554e0 with its five previous uncommitted UX/contract/browser-test files intact. Preserve/include this deployed proxy repair before the next frontend deployment.

After Pro is reachable, inspect wake/sleep evidence, recheck Docker API/PostgreSQL, original Liftory Funnel, AC-awake and delivery state, then repeat public health/session/Google initialization. Other intentionally paused services remain paused. No real Google credentials need replacement for this DNS incident.

## Final recovery after the owner reopened Pro

At17:15UTC the owner reopened and powered Pro. SSH returned; original API/PostgreSQL containers remained healthy, and the AC-awake assertion was active. Power logs show the earlier16:57:38UTC sleep occurred on battery; later logs include clamshell sleep. AC-only caffeinate does not keep the host available after removing power or guarantee hosting with a closed lid. For the current hosting setup keep Pro on AC with its lid open. Global sleep settings were not weakened.

DNS subsequently resolved normally again. Public HTTP initially stalled after wake despite successful TLS; loopback forwarding also briefly stalled while the API answered inside its container. Only the owned Liftory tunnel LaunchAgent was restarted, retaining its identity and routes. No Docker/database restart or migration was performed. Both host-loopback and public health then returned200.

Final public checks at17:20:05–17:20:08UTC all passed: health200 atb2554e0, session200 with Google enabled and development identity disabled, records401 without authentication, Google initialization200 with correct callback and secure host-only state cookie, wrong/missing Origin403 without cookies, and private/no-store caching. A fresh Chrome session loaded the site200 without script errors and clicking Google showed accounts.google.com/v3/signin/identifier, title Sign in - Google Accounts, and the normal Email or phone prompt for liftory-dev.vercel.app. No Google credentials were entered and no new interactive token exchange was claimed.

The optional DNS fallback remains configured; normal DNS has priority and is currently available. The earlier owner question about host availability is resolved. No repair commit/push has been made, and the original five exercise-progress edits remain untouched.
