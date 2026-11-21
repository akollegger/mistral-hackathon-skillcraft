# Skillcraft — Project Plan

**Do models remember, transfer, or search? A crafting-table evaluation of skill distillation in teacher/student Mistral agent pairs.**

Skillcraft measures how AI agents acquire knowledge, using a Minecraft-inspired crafting table as a diagnostic instrument. Given a 3×3 crafting grid and an inventory of resources, Mistral agents craft target items through tool calls, with live visual feedback on every action: each placement or removal reports whether the current grid is craftable and what it would produce. Challenges come in three tiers — traditional (retrieval), derived (transfer), and invented (search) — and the experiment proper is skill distillation: a teacher agent solves invented-tier challenges, writes a portable skill file, and that skill is handed to a cold student agent judged on both taught and held-out tasks.

At the event: judges see live agent runs, real distilled skill files, a queryable provenance graph, and a replayable crafting table.

## Sequenced project plan

> Phase gates matter more than durations. P1 gates everything; P3–P6 branch into a parallel track. Kill criteria are per phase — when a kill criterion fires, take the fallback and keep moving.

### Phase 0 — Environment (pre-event prep, legal)

- [ ] `relate` binary + `relate-mistral` plugin installed, `vibe` CLI on PATH, auth working
- [ ] Smoke test: one one-shot Vibe run in a fresh directory calling a no-op tool
- [ ] Smoke test: Relate store create, write, query; MCP roundtrip from Vibe (`vibe mcp add`)
- [ ] Kill criterion: N/A (pre-event). If anything here fails on event day, Phase 1 has a 30-minute timebox for recovery only.

### Phase 1 — Crafting world model + tool interface (gates all) (~1.5–2 h)

**Sequential; blocks P2 on. Do not parallelize yet.**

- [ ] 3×3 grid, inventory with resources and quantities, hidden recipe book
- [ ] Tool grammar: `place(item, slot)`, `take(slot)`, `clear()`, `craft()` — every call returns `{craftable, would_produce, inventory, grid}`
- [ ] Canonical traditional recipes, rotation/mirror-equivalence validation, feedback exactness verified against spec
- [ ] 1 derived scenario (stool) with hidden acceptable-recipe set + partial-credit rule
- [ ] 1 invented scenario (foo/meh/fiz → bar) with hidden recipe, feedback-driven search possible, no items in training corpus
- [ ] Kill criterion: if the world model exceeds its timebox, fix this before writing any real runs; salvage is fixing feedback only (no equivalence).

### Phase 2 — Run protocol + harness (gates all) (~1.5 h)

**Sequential with P1; starts as soon as P1's tool grammar is frozen.**

- [ ] Teacher prompt template: task statement + tool description + "solve, then write a skill file at skill.md" + skill-format rubric (procedure > answer; strategies, pruning, feedback patterns)
- [ ] Student prompt template: identical, minus teaching instruction; condition variable injected (nothing / transcript / skill)
- [ ] Directory orchestration: fresh dir per run, fork for comparison runs, skill copy-in, transcript write-in
- [ ] Logging: per run — task, condition, initial inventory, event stream (every tool call + feedback), final grid, outcome, duration
- [ ] JSON-line logging **working first**, Relate write path second; both always on for real runs
- [ ] Kill criterion: if Relate write exceeds 90 min total, drop Relate, keep JSON lines, ship a browsable HTML view from logs instead.

### Phase 3 — Teacher runs (parallelizable) (~1–1.5 h)

- [ ] Teacher solves invented scenario; verify skill lands in file, is procedure-like not answer-like (manual check, 2 min)
- [ ] N=3 teacher runs for spread (skill quality variance is a finding, not noise — keep them all)
- [ ] Record everything; classify each skill answer-like vs procedure-like

### Phase 4 — Conditions grid (parallelizable) (~1.5–2 h)

**P3 and P4, not P4 on P3: transcript condition needs P3 outputs, but no-skill condition can run as soon as P2 is done. Sequence within P4: start no-skill runs immediately, start skill/transcript runs when P3 delivers.**

- [ ] Per tier × condition: no-aid, skill, transcript
- [ ] Taught task + held-out task per cell (held-out invented scenarios need their own hidden recipes, prepared in P1)
- [ ] Repeats: minimum n=3 per cell for a mean and spread
- [ ] Log every run; no cell is judged on a single run (nondeterminism is real)
- [ ] Timebox the grid: pre-commit to grid dimensions before P3 starts; cut repeats before cutting cells

### Phase 5 — Eval queries + analysis (parallelizable, ~1 h)

- [ ] Skill lift per tier: success rate with skill vs. without, taught vs. held-out
- [ ] Sample-efficiency curve: student success vs. examples in skill (2–3 points is fine)
- [ ] Strategy quality: tool calls + failed attempts per success, by condition
- [ ] Skill quality correlation: student outcome vs. teacher skill answer-likeness
- [ ] Output: one judge-ready results table + one lineage view in Relate

### Phase 6 — Playback UI (stretch, fully parallel) (~1–2 h, timeboxed)

- [ ] Built from the event log format only — never from live agent state — so it can't break anything upstream
- [ ] Event-log replayer: mocked crafting table, inventory strip, place/take/clear/craft steps, craftable feedback rendering, step/scrub controls
- [ ] Aesthetic spec: concrete Minecraft reference passed to Vibe ("pixel-art textures, 3×3 grid, slot hover states"), not "make it nice"
- [ ] Demo scene: teacher search → distilled skill → cold student success, replayed side by side
- [ ] Kill criterion: zero core time spent. UI work by a teammate or after the grid is green; if partial, replaying just one teacher run + one student run counts as done.

### Phase 7 — Pitch + write-up (serialize last)

- [ ] Pitch: "remembering, transferring, or searching?" framing → live replay → show the skill file next to the transcript → headline table → live lineage query
- [ ] Disclose prep/ split: tooling pre-built vs. runs/results generated at the event; this is both a rules safeguard and a credibility asset

## Parallelization summary

| Phase | Runs in parallel with | Blocking gate |
| --- | --- | --- |
| P1 world model | nothing (critical path) | blocks P2+ |
| P2 harness | P1 (starts on grammar freeze) | blocks all runs |
| P3 teacher runs | P4a (no-skill condition runs) | transcript/skill cells need P3 |
| P4 conditions grid | P3 (partially), P5 partially, P6 fully | blocks P7 numbers |
| P5 eval | P4 tail-end runs | blocks P7 |
| P6 playback | P3/P4/P5 entirely | none — never on critical path |
| P7 write-up | nothing | last |

Team split (or solo ordering): solo → P1→P2 strictly sequential, launch P3+P4a as background runs, build P5 queries while the grid chews, P6 only if capacity remains; team of 2 → one on runs (P3/P4), one on P6 from the event-log spec written in P2; team of 3+ → evals and write-up get a dedicated owner.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Nondeterminism muddies results | Repeats with spread, never single-run cells; grid dimensions pre-committed |
| Skills collapse to cached answers | Skill-format rubric, answer-vs-procedure classification, held-out tasks, transcript condition |
| Relate integration eats time | 90-min kill criterion → JSON-line fallback |
| Feedback spec ambiguity (variant placements) | Rotation/mirror equivalence decided in P1, validated against spec before real runs |
| Invented tier too hard (zero successes) | Keep feedback rich enough for search; partial credit for well-formed attempts; report attempt-effort even on failure — cuts are interesting |
| One-day time crunch | Pre-declared grid dimensions, P4 starts no-skill immediately, P6 fully parallel and droppable |
