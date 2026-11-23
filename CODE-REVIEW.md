# Code review: Skillcraft (skill distillation, teacher → student)

**Scope:** whole repository at `main` (b29802b) plus the uncommitted working tree. Reviewed: `packages/{contracts,world,harness,analysis,playback}`, `docs/`, and the round-3 findings note. I also checked the on-disk `results/runs` data against that note.
**Method:** code reading, running the existing test suites (all pass: harness 28, playback 28, world 13, analysis 1), and tallying `results/runs/*/run.meta.json` and `events.jsonl`. No code was changed in this review.
**Audience:** the Mistral team that owns this project. Findings are ordered by how much they affect the validity of the reported results.

## Summary

The architecture is good for a one-day build. The experiment, as currently run and reported, does not yet support the round-3 conclusions. There are two data-integrity bugs (A1, A2), a labelling bug that makes the analysis tables wrong for one cell (A1), and a sample size too small to distinguish any of the reported differences from noise (B1). All are fixable without changing the overall design.

## What works well

- **Layering.** Zod contracts, a pure world model, a one-`World`-per-run MCP server, and an append-only event log that is the single source of truth. Playback reads only `events.jsonl`.
- **Anti-cheat and isolation** (`packages/harness/src/index.ts`): relate ports asserted closed, ambient skills moved aside and recorded, no MCP config in run dirs, a contamination flag, and a skill frontmatter gate.
- **Honest write-up.** The round-3 note reports its own anomaly (fence 0/3) and the tooling bugs it hit.
- **Confound hygiene.** The single neutral `item:` namespace and the "in general" vs "this specific example" rubric are good instincts.
- **Tests** cover the world, the MCP server, event parsing and the replayer, and they pass.

## A. Bugs that affect results

### A1. Fence scenario is labelled `heldOut: false` (high)
`packages/world/src/datasets.ts:123` sets `heldOut: false` on `fenceFromLogsScenario`, while `packages/harness/src/grid.ts` marks the cell `heldOut: true`. `spawnRun` builds run meta from `req.scenario.heldOut` (`packages/harness/src/index.ts`, `buildRunMeta` call), so every fence run on disk has `heldOut=False` in `run.meta.json`.
`skillLift()` in `packages/analysis/src/index.ts` groups by `meta.heldOut`, so fence is pooled with pickaxe as "taught" and the traditional held-out row is empty. The P4 lineage store takes `heldOut` from the cell, so Relate and the analysis package disagree.
**Suggestion:** have the driver stamp `heldOut` from the grid cell, or set it correctly in the scenario. Add a test that cell and scenario `heldOut` agree.

### A2. Held-out recipes are discoverable during the taught runs (high)
`inventedBook` contains both `inv:bar` and `inv:qux`, and the bar task uses that book (`grid.ts`). The bar inventory (foo 2, meh 1, fiz 3) is enough to build qux, so the `wouldProduce` feedback reveals the "held-out" recipe while the teacher solves bar, and the teacher can write it into its skill. This breaks anti-cheat rule 5 in `docs/demo-matrix.md` (held-out recipe enters the graph only after scoring). Likewise the pickaxe inventory (5 planks, 2 sticks) can build a fence.
**Suggestion:** build each task's book from only the recipes it needs plus deliberate distractors, and test that no held-out recipe is craftable in any taught scenario.

### A3. Transcripts are always labelled success; failed teachers supply skills (medium)
`packages/harness/src/p4.ts:134` passes `outcome: "success"` unconditionally to `renderTranscript`. `loadTeacherSkills` accepts any teacher run that has a `skill.meta.json`, including the stool teacher that hit the 200-call timeout (round-3 note: "stool 1/2").
**Suggestion:** read the real outcome from `run.meta.json`, and either exclude unsuccessful teacher runs as skill/transcript sources or record that they were used.

### A4. Failure causes are conflated and the cap shapes the headline (medium)
P4 stores only `success`/`fail`. In `results/runs`, student failures are exit code 3 (timeout), and nearly all contain "tool-call budget exhausted" events. Three limits interact: 80-call cap, 30 turns, 300 s. The note's "budget exhaustion, not wrong recipes" is plausible but is not separated from the other two limits.
Refused calls are also counted in `toolCalls`, which is why "average tool calls" exceeds the cap (e.g. stool none: 86–90).
**Suggestion:** record failure reason (budget / timeout / turns / gave up), report calls up to the first exhaustion, and say how sensitive results are to the 80 cap.

### A5. Results folder does not reproduce the write-up (medium)
`results/runs` has 202 run dirs, versus the 66 runs the note describes. Several rounds are mixed in one folder: the fence cells hold 30 student runs per condition. Counting them directly gives fence none 20/30, transcript 21/30 and skill 16/30, not the 3/3, 1/3 and 0/3 in the note. The round-3 table cannot be regenerated from the repo as it stands.
**Suggestion:** add a `round` field to run meta (or reliably archive), and have analysis take a round filter.

## B. Experiment design

- **B1. n=3 per cell cannot support the conclusions.** 1/3 vs 2/3 (stool, bar) and 0/3 vs 1/3 (qux) are indistinguishable from noise. Even fence 3/3 vs 0/3 has a two-sided Fisher exact p of about 0.1. "Skill lift is real" should read "directionally suggestive at n=3". Aim for at least 10 per cell and report confidence intervals.
- **B2. One task per tier.** A tier effect cannot be separated from task quirks. Use several tasks per tier.
- **B3. Tier is confounded with depth, inventory and cost.** Pickaxe is depth 1 from planks and sticks. Fence is depth 3 from logs (logs → planks → sticks → fence). `docs/demo-matrix.md` calls the pairs "same procedure, different answer"; that holds for bar/qux, not for pickaxe/fence. The 0/3 fence result is therefore as likely to reflect a depth mismatch as skill over-generalization.
- **B4. Invented tier has a tiny search space.** Bar and qux are each a single column of three items, so there are 6 orderings. Search difficulty is not comparable to the derived task.
- **B5. Teacher vs student comparisons mix model and budget.** Teacher+skill cells use `mistral-large-4-0` with a 200-call cap; students use `mistral-medium-latest` with 80.
- **B6. Skill rotation across reps mixes skill quality into the "skill" condition** (`skillFor` in `p4.ts`). Report per-skill results or pin one skill per scenario.
- **B7. Two analysis metrics are not implemented as described.** `exampleCount` counts code fences (`p3.ts:107`), not examples, so `sampleEfficiency()` does not measure the README's "sample efficiency". `classification` is always `"unknown"`, so `skillQuality()` returns nothing.
- **B8. "Taught" student cells replay the exact scenario** the skill was written for, so they test recall of an embedded answer more than distillation. That is a legitimate control, but the write-up should name it as one.

## C. Smaller items

- `packages/world/src/shape.ts:134-139`: commented-out debug block; remove.
- `spikes/*/scratch` (session journals, WAL and lock files) is committed; consider ignoring it.
- The README still describes the repo as prep-only with `// EVENT:` stubs; update it.
- `pnpm -r exec tsc --noEmit` fails (`tsc` not found), so there is no working type-check step in the workspace.
- `results/` is gitignored, so the evidence behind the round-3 table is not in the repo.
- The working tree has uncommitted changes in `relate.ts`, `main.ts`, `runs.ts` and `app.smoke.test.ts`, plus untracked `p6.ts` and `runs.test.ts`. I did not review these in depth.

## Suggested order

1. A1 and A2 (labelling and recipe leak); these invalidate specific cells.
2. A3 and A5 (skill/transcript provenance, reproducible rounds).
3. A4 (failure-reason recording), then rerun with n ≥ 10 per cell (B1).
4. B2/B3 (more tasks per tier; matched depth for held-out pairs).
5. The P5 distill-from-log experiment already proposed in the round-3 note.
