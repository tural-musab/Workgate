# Workgate

Workgate is a local-first, cloud-ready control plane for prebuilt AI teams. The current version focuses on a single trusted operator who can launch workflow templates, inspect artefacts, manage approvals, and release approved output through the right connector.

## Stack

- Next.js App Router
- TypeScript / pnpm workspace
- LangGraph.js for orchestration
- Drizzle ORM
- pg-boss with inline fallback for local bootstrap
- Octokit for GitHub integration

## Workspace layout

- `apps/web`: operator dashboard, route handlers, auth, UI
- `packages/shared`: shared types and schemas
- `packages/db`: Drizzle schema and persistence adapters
- `packages/agents`: agent graph, policies, provider adapters
- `packages/github`: GitHub and local repo execution helpers
- `docs`: ADRs, contracts, policy, roadmap, TODOs

## Getting started

1. Copy `.env.example` to `.env`.
2. Provide `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `AUTH_SECRET`.
3. Start a local PostgreSQL instance and create the `aiteams` database if you want durable storage.
4. Run `pnpm install`.
5. Run `pnpm db:push` when `DATABASE_URL` points at PostgreSQL.
6. Run `pnpm dev`.

If PostgreSQL is not available, the app falls back to an in-memory store and inline queue so the product can still be explored locally. Persistent runs and `pg-boss` require a running PostgreSQL database.

## Supabase remote PostgreSQL

Workgate is prepared for a remote Supabase PostgreSQL setup.

1. Open `.env`.
2. Replace `DATABASE_URL` with your real Supabase session-pooler or direct PostgreSQL connection string.
3. After that connection works, change `AI_TEAMS_QUEUE_DRIVER=pgboss`.
4. Run `pnpm db:push`.
5. Start the app with `pnpm dev`.

Until `DATABASE_URL` is real, the default `.env` keeps the queue in `inline` mode so local startup does not depend on a live database.

## What ships in v1

- Workflow-first task intake and run orchestration
- Fixed multi-role pipeline: router, coordinator, research, pm, architect, engineer, reviewer, docs
- Active templates: `Software Delivery Team`, `RFP Response Team`
- Coming-soon templates surfaced in UI: `Social Media Ops`, `Security Questionnaire Team`
- Review artefacts, retry/cancel/delete controls, and approval queue
- GitHub PAT settings and repo allowlist for the `Software Delivery Team`
- Draft pull request creation after human approval for software runs
- Approval-only completion flow for non-GitHub workflows such as RFP response work
