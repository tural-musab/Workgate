# Supabase Remote Setup

Workgate supports a remote Supabase PostgreSQL deployment for durable storage and `pg-boss`.

## Recommended connection type

Prefer one of these:

- Supabase session pooler
- Direct PostgreSQL connection

Avoid the transaction pooler for long-lived worker behavior when you move the queue to `pg-boss`.

## What to update

In `.env`:

- replace `DATABASE_URL` with the real Supabase PostgreSQL connection string
- change `WORKGATE_QUEUE_DRIVER=pgboss`

## Bootstrap flow

1. Confirm the database is reachable from your machine.
2. Run `pnpm db:push`.
3. Run `pnpm dev`.
4. Sign in with the seeded operator credentials from `.env`.
5. Go to Settings and enter the GitHub PAT plus allowlisted repos.

## Current local-safe default

The generated `.env` uses:

- placeholder Supabase URL
- `WORKGATE_QUEUE_DRIVER=inline`

That keeps the app runnable before the real remote database is ready.
