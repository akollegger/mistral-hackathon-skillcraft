# Contracts package

Shared zod schemas pinning decisions made in [`2-project-brief.md`](../../2-project-brief.md).
This is spec, not implementation: every schema corresponds to a brief-level decision.

- `tool.ts` — the craft tool grammar and feedback contract
- `event-log.ts` — the run event stream (harness writes it, analysis and playback read it)
- `scenario.ts` — tasks, tiers, recipe books, conditions, roles
- `graph.ts` — Relate lineage types mirrored to the Cypher in `docs/graph-schema.cypher`
