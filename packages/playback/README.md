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

In dev, a vite plugin serves a run index from `results/` (override with
`SKILLCRAFT_RESULTS_DIR`): `GET /api/runs`, `GET /api/manifest`
(`results/demo-manifest.json`), `GET /api/run/<runId>/events.jsonl`. With no `results/`
(or in the static build) the app falls back to the bundled demo fixtures in
`public/demo/runs/` (6 runs covering the full demo matrix).

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

## Notes

- The replayer accepts both payload shapes: the frozen contract (`op`, flat feedback) and
  the harness emitter (`tool`/`input`, feedback nested under `output`, reduced `run_start`,
  `run_end` as `{exitCode}`). The contract's `Inventory` is a zod `z.map`, which cannot
  round-trip through JSON; records and entry-pairs are both accepted.
- Imports use `@skillcraft/contracts/event-log` subpaths because the package barrel has a
  pre-existing ambiguous `Condition` re-export (fails `tsc`).
- Sync with main: this package is additive; `git merge origin/main` into the feature branch.
