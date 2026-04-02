# Agent Contracts

## Fixed roles

- `router`: classify the request, estimate risk, decide if human escalation is required
- `coordinator`: turn the routed request into a short execution brief
- `research`: gather context and produce a source-oriented research memo
- `pm`: convert the request into a scoped product spec
- `architect`: produce an architecture memo and risk framing
- `engineer`: generate patch notes and the concrete repo change plan
- `reviewer`: critique the engineer output from a different model family
- `docs`: generate changelog-style closing artefacts

## Required outputs

Every role must return:

- `summary`: one concise paragraph
- `deliverable`: primary role output
- `risks`: zero or more explicit risks
- `needsHuman`: boolean

## Required artefacts

At the end of a successful run, the system must have:

- `plan_summary`
- `review_report`
- `test_report`
- `change_summary`

These are stored as v1 artefact types:

- `research_note`
- `prd`
- `architecture_memo`
- `patch_summary`
- `test_report`
- `review_report`
- `changelog`

