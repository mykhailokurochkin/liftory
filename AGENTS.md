# Liftory

Independent product repository on the Mac at `~/projects/personal-development/liftory`.
Run host commands through `pdev-mac sh -s` and `cd ../liftory` (helper starts in home-server).
Do not modify the toolkit, home-server code, other Docker workloads or global tool versions.
Backups are deferred by the owner. No schedules, backup storage or host restarts in this work.
Keep the owner informed in Ukrainian; never print secrets, complete environments or Docker credentials.

Architecture: pnpm/Turborepo; Next.js web; NestJS API; PostgreSQL/Drizzle; shared Zod contracts;
IndexedDB owns local workout drafts and an idempotent synchronization outbox.
Deployment decision: Next.js on Vercel; NestJS/PostgreSQL and future Redis on the Intel Mac Pro.
Browser requests remain same-origin: Vercel /api rewrites to the Pro HTTPS tunnel endpoint.
Redis is planned for future queues, not implemented. See docs/deployment.md before changing delivery.
Google OAuth through Better Auth; development identity is explicitly local-only and forbidden in production.
Every record, query and receipt is scoped to the authenticated server user ID.
Never cache API/auth responses in a service worker. Offline edits need a committed IndexedDB transaction.

Before commits run format/lint/typecheck/tests and verify relevant real behavior. Git flow is
feature/* -> develop -> main. The owner authorized implementation; do not claim external OAuth or
iPhone verification without actually completing it. Keep missing credentials distinct from finished code.
Check disk before heavy operations. Stop below 10 GiB; do not prune or remove unrelated data.

On 2026-10-28 the owner resumed dependency installation and deployment preparation. Heavy installs,
builds and verification run on Pro; Air remains the source repository and has limited free disk.
Current evidence and external prerequisites: docs/verification-2026-10-28.md.
Liftory commits/pushes still require the owner's permission. The home-server autonomous commit grant
does not apply to Liftory. The public dev frontend is https://liftory-dev.vercel.app; real Google
OAuth, API publication and live CI/CD are not yet verified.
