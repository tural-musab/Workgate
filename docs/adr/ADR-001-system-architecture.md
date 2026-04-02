# ADR-001: Workgate V1 System Architecture

## Status

Accepted

## Decision

Workgate v1 is implemented as a pnpm workspace with a Next.js App Router web application, shared workspace packages, a PostgreSQL-first persistence model, LangGraph.js orchestration, and GitHub-backed software execution. The default local queue driver is inline to preserve a smooth bootstrap path when PostgreSQL is unavailable, while `pg-boss` remains the production queue engine.

## Why

- The operator dashboard and API share the same type system.
- LangGraph gives explicit, inspectable agent transitions.
- PostgreSQL + Drizzle provides a durable core for runs, approvals, artefacts, and audit trails.
- Inline queue fallback keeps development viable on machines without a running database.
- Template-driven execution keeps v1 narrow and measurable while allowing non-GitHub workflows.

## Consequences

- V1 is safe by default but not yet sandbox-grade for untrusted repositories.
- Browser automation, RBAC, and GitHub App auth are deferred to later phases.
- Queue and storage abstractions must support both inline and PostgreSQL-backed modes.
- GitHub remains connector-specific rather than platform-wide.
