# @skillcraft/playback (stretch, plan P6)

Event-log replayer; mocked crafting table UI. Fully parallel, never on the critical path.

- Consumes `events.jsonl` only (never live agent state), per `docs/demo-matrix.md`.
- Lofi pixel-art UI: 32×32 procedurally painted sprites, chunky black borders on a clean
  white base, Mistral gradient accents (`#FFD800 → #E10500`).

## Run it

```sh
pnpm --filter @skillcraft/playback dev      # http://localhost:5173
pnpm --filter @skillcraft/playback build    # static bundle in dist/ (base "./", hostable anywhere)
pnpm --filter @skillcraft/playback test     # replayer + UI smoke tests
pnpm --filter @skillcraft/playback typecheck
```

In dev, a vite plugin serves the run index from `results/` (override with
`SKILLCRAFT_RESULTS_DIR`): `GET /api/runs`, `GET /api/manifest`
(`results/demo-manifest.json`), `GET /api/run/<runId>/events.jsonl`. `/api/runs` reads
the **Relate lineage DB** at `results/lineage` first (read-only handle via
`@relate/relate`, so it coexists with the harness writer) — `Run` nodes for metadata and
`(teacher)-[:GENERATED]->(:Skill)-[:USED_IN]->(student)` edges for pairing — and falls
back to scanning `run.meta.json` / `events.jsonl` when no DB exists. Replay itself always
reads `events.jsonl` only. With no `results/` (or in the static build) the app falls
back to the bundled demo fixtures in `public/demo/runs/` (6 runs covering the full demo
matrix).

## Scenario chooser (docs/demo-matrix.md)

- **Scenario select** in the header: one entry per taught task, richest first.
- **Both panes always visible** — teacher left, student right. Loading a scenario starts
  both on the no-skill/taught runs (matrix runs 1 + 4).
- **Per-pane toggles**: `no skill | skill` and `taught | held-out`. Taught runs match by
  `taskId`; held-out runs live under a different task in the same tier, so they match by
  `tier`. A run `<select>` lists other matching runs (most recent first).
- **▶ demo story** walks the narrative 4 → 1 → 5: student baseline fails, teacher
  generates the skill, student with skill succeeds — each step auto-plays.
- Manual override: file pickers or drop `events.jsonl` files anywhere (first → teacher,
  second → student).

## Publishing to gh-pages (post-event only)

Raw `results/` stays gitignored (anti-cheat rule 5 — held-out answers must not leak).
Publishing is a deliberate, post-judging act that ships only the sanitized export:

```sh
pnpm --filter @skillcraft/playback deploy   # export:data → build → push dist/ to gh-pages branch
```

- `scripts/export-static.mjs` reads `results/lineage` (Relate, read-only) + `events.jsonl`
  and writes `public/data/`: `runs.json` (index + skill pairs), `graph.json` (Run/Skill/Task
  nodes + GENERATED/USED_IN/ATTEMPTED/SCORED_BY edges — Recipe/Book/Item nodes are excluded),
  and `runs/<runId>.jsonl` replay streams. `public/data/` is gitignored.
- On the deployed site the client source order is: dev API → `./data/runs.json` → demo
  fixtures, and the **lineage panel** loads `graph.json` into an in-memory
  `@relate/relate-wasm` DB so judges can run live Cypher (teacher→skill→student pairs,
  skill lift) in the browser — no server.
- `scripts/deploy.mjs` pushes `dist/` to the `gh-pages` branch via the `gh-pages` package.

## Notes

- The replayer accepts both payload shapes: the frozen contract (`op`, flat feedback) and
  the harness emitter (`tool`/`input`, feedback nested under `output`, reduced `run_start`,
  `run_end` as `{exitCode}`). The contract's `Inventory` is a zod `z.map`, which cannot
  round-trip through JSON; records and entry-pairs are both accepted.
- Imports use `@skillcraft/contracts/event-log` subpaths because the package barrel has a
  pre-existing ambiguous `Condition` re-export (fails `tsc`).
- Sync with main: this package is additive; `git merge origin/main` into the feature branch.
