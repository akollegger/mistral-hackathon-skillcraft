# Demo matrix — per-scenario run set for the playback visualizer (P6)

Agreed 2026-11-21 with the visualizer worktree. For **each scenario** the demo shows
6 runs, all in fresh isolated dirs, grouped by `run.meta.json` fields
(`role`, `condition`, `taskId`, `heldOut`) plus `results/demo-manifest.json` for the
teacher→skill→student pairing (written by the P4 driver; outside the frozen `RunMeta`).

| #   | Run                      | Pane meaning                                                                      |
| --- | ------------------------ | --------------------------------------------------------------------------------- |
| 1   | teacher, none, taught    | cold search; **generates the skill** (P3)                                         |
| 2   | teacher, skill, taught   | skill effect at high capability — success saturates, signal is toolCalls/duration |
| 3   | teacher, skill, held-out | strong-model transfer                                                             |
| 4   | student, none, taught    | cold baseline                                                                     |
| 5   | student, skill, taught   | headline skill lift (5 vs 4)                                                      |
| 6   | student, skill, held-out | **transfer**: skill for a related task applied to a not-yet-seen task             |

Comparisons: 2−1 skill lift (teacher), 5−4 skill lift (student), 3 vs 6 capability gap
on held-out, 5 vs 6 taught-vs-held-out drop for the student.

## Semantics

- **Held-out** = a task the teacher never saw; its recipe enters the Relate graph only
  AFTER the run is scored (anti-cheat rule 5). Held-out tasks are related-but-different
  (same procedure, different answer): traditional pickaxe↔fence, invented bar↔qux.
- **teacher-with-skill** runs in a _fresh_ dir with the harvested skill installed
  (never the teacher's own output dir), rendered with the _student_ prompt shape plus
  condition injection, but spawned with the teacher model (`mistral-large-4-0`).
- Student model: `mistral-medium-latest`. Skill pinned per scenario = the paired
  teacher run's output (one canonical skill per scenario for the demo; P4 grid
  rotates skills across reps for variance).
- Real P4 grid = these cells at n=3, plus `transcript` condition and `none`-on-held-out
  for clean lift math. The visualizer picks one representative run per pane.

## Visualizer contract

- Reads only `results/runs/<runId>/events.jsonl` (never live agent state; `results/`
  is gitignored — sync source only).
- Envelope frozen (`contracts/event-log.ts`): `{ts, seq, kind, payload}`.
- Key off `payload.tool` (`place`/`take`/`clear`/`craft`), not the namespaced
  `toolName` (`mcp_skillcraft.<tool>`). `tool_feedback.payload.output` carries the full
  `{craftable, wouldProduce, grid, inventory}` after every action.
