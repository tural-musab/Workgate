# Security And Tool Policy

## Trust model

V1 assumes trusted target repositories. The system only operates on repositories explicitly allowlisted in settings.

## Tool classes

- `read`: inspect repository files, read metadata, list refs
- `write`: create temp worktree changes, create branches, push branches, open draft pull requests
- `high-risk`: empty in v1

## Approval gates

The system must pause for human approval before:

- pushing any branch
- creating any pull request

## Explicit non-goals for v1

- browser automation
- financial or legal workflows
- production deployment
- automatic merge
- arbitrary untrusted code execution

