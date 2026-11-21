# Design note — matrix round 3 findings (2026-11-21, post-hackathon)

Round 3 = the first full matrix run after two deliberate confound fixes:

1. **Single item namespace.** All item ids moved from `minecraft:` / `derived:` /
   `invented:` to one neutral `item:` namespace (`packages/world/src/datasets.ts`),
   so the id itself no longer reveals the scenario tier. Recipe ids (`mc:`/`dv:`/`inv:`)
   stay internal (never serialized to prompts). Prompt shape was already
   scenario-uniform; only target item + inventory lines vary.
2. **Teaching rubric reworded** (`packages/harness/src/prompts.ts`, TEACHING_PHASE):
   skills must label every claim as **"in general"** or **"this specific example"**
   (example claims may not read as instructions about the reader's task), and the
   student "may face a DIFFERENT but related task — or the same task again".

66 runs total: 6 P3 teachers (skill generation, `mistral-large-4-0`) + 45 P4 students
(3 conditions x 3 reps x 5 cells, `mistral-medium-latest`) + 15 teacher+skill demo
cells. Lineage in `results/lineage` (Relate store), manifest in
`results/demo-manifest.json`. Older matrices archived under `results/archive/`.

## Results (student success, n=3 per cell)

| Task (tier)            | none   | transcript | skill  | avg tool calls (none → skill) |
| ---------------------- | ------ | ---------- | ------ | ----------------------------- |
| trad-pickaxe-1         | 3/3    | 3/3        | 3/3    | 6 → 6 (saturated)             |
| trad-fence-1 (held-out)| 3/3    | 1/3        | **0/3**| 64 → 83                       |
| der-stool-1 (derived)  | 1/3    | 1/3        | **2/3**| 88 → 76                       |
| inv-bar-1 (invented)   | 1/3    | 1/3        | **2/3**| 71 → 59                       |
| inv-qux-heldout        | 0/3    | 0/3        | 1/3    | 87 → 84 (partial transfer)   |

Teachers: pickaxe 2/2, inv-bar 2/2, stool 1/2 (one 200-call timeout). Teacher+skill
demo cells succeeded 12/15, cheaply when they did (pickaxe 6, bar 4, fence 18 calls).

## Highlights

- **The rubric change worked as intended.** Round-3 skills (e.g. pickaxe skill
  `53efdc46…`) are explicitly sectioned "In general" vs "This specific example",
  and instance details (target `item:wooden_pickaxe`, inventory, 6-step transcript)
  are quarantined under the example label instead of reading as instructions.
- **Skill lift is real but task-dependent.** It shows exactly on multi-stage /
  non-canonical tasks: stool 1/3 → 2/3, bar 1/3 → 2/3, held-out qux 0/3 → 1/3.
  On saturated pickaxe there is nothing to lift (6 calls either way).
- **Transfer can actively hurt — the fence anomaly.** Fence-heldout students were
  pinned to the *pickaxe* skill (tier-level transfer, per demo-matrix.md) and went
  **0/3 with skill vs 3/3 without**. Reading that skill shows why: its "in general"
  search strategy claims "most pickaxe/axe/hoe recipes are 3-across + 2 sticks down
  the center column" — an instance shape heuristic mislabeled as general — while the
  fence recipe is `plank-stick-plank` on two rows. The labeling fix stopped the leak
  of instance *facts*; it did not stop over-generalization of instance *strategy*.
- **Cold baselines fail by budget exhaustion, not wrong recipes.** Failing runs
  (fence transcript ×2, stool/bar/qux none) all die at 80-90 calls of
  place→craft→clear brute force; the failure mode is search, not knowledge.
- **Tooling bugs found via the eval UI this round** (all fixed, tests green):
  sprite registry keyed on `planks` while items are `oak_planks` (grid rendered as
  random gems); replayer inventory schema used `positive()` so any 0-count item
  (e.g. both sticks placed) silently froze the board at the last feedback;
  pickaxe sprite redrawn twice to be perpendicular to the handle; Relate store
  misidentified as cypherlite (it is Relate v1.2.0 — `relate query -d results/lineage`);
  lineage graph can lag the filesystem, so the run index now filters to on-disk run
  dirs; the store is single-writer, so ad-hoc queries must tolerate `storage locked`.

## Take-aways

- **Namespace confounds are cheap to remove and worth removing.** Tier-prefixed
  item ids let models infer "derived = multi-stage" without evidence; one neutral
  namespace removes that channel. Item *names* still carry meaning (that is the
  task), which is fine — discovering "these are Minecraft recipes" organically is
  part of the test.
- **Skill distillation quality — not solving — is the bottleneck.** The teacher
  solved pickaxe in 6 calls but distilled a skill whose headline heuristic only
  fits its own task family. This matches experience in other contexts: asking a
  model to explain/distill a good answer in the same context is unreliable;
  distilling from the *log alone* ("here is a log of an agent solving a problem;
  produce an efficient skill") sometimes does better, sometimes worse — the
  in-context teacher knows intent but anchors on its instance, the cold distiller
  sees only trajectory evidence.
- **Held-out transfer is partial and directional.** Same-procedure/different-answer
  pairs (qux) mostly fail for students (1/3 best case); the teacher+skill cells show
  the procedure does transfer for the strong model when the skill is good (bar 3/3,
  4 calls).

## Suggested next steps

1. **P5 distillation driver:** spawn a separate distiller run per teacher
   `events.jsonl` with only the log attached ("produce an efficient skill"), harvest
   as the scenario skill, re-run P4, and compare skill cells (stool 2/3, bar 2/3,
   qux 1/3, fence 0/3) against round 3. This is the highest-value experiment.
2. **Fix the over-generalization channel:** require "in general" claims to be
   justified by ≥2 distinct observations in the log, or have the distiller mark
   confidence; specifically test whether removing shape heuristics from "in general"
   fixes fence 0/3 → ≥2/3.
3. **Held-out design:** consider pairing held-out cells with a *distilled-from-log*
   skill rather than the raw teacher skill, to separate "procedure transfer" from
   "skill quality".
4. **Re-run the full matrix** after any prompt/rubric change so rounds stay
   comparable (round 3 is the current baseline; archive before re-running).
5. **Ship the visualizer:** `pnpm export:data && pnpm build` in `packages/playback`
   (note: the static `graph.json` export still includes archived graph nodes —
   filter it like the run index if archive hygiene matters for the public site).
