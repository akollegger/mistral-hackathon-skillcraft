# Skillcraft

**Do models remember, transfer, or search? A crafting-table evaluation of skill distillation in teacher/student Mistral agent pairs.**

Skillcraft measures how AI agents acquire knowledge, using a Minecraft-inspired crafting table as a diagnostic instrument. Given a 3x3 crafting grid and an inventory of resources, a Mistral agent must craft a target item using tool calls: place a resource in a slot, take it back, clear the grid, or craft. The table honors Minecraft's visual feedback contract: every placement or removal tells the agent whether the current grid is craftable and what it would produce.

Each agent faces three tiers of challenge:

1. **Traditional** (craft a pickaxe): canonical recipes. Success comes from facts memorized in training. _This is retrieval._
2. **Derived** (craft a stool): plausible recipes that are not part of the game. Success requires generalizing from known combinations to related ones. _This is transfer._
3. **Invented** (craft a bar, given quantities of foo, meh, and a fiz): out-of-distribution resources that do not exist. Nothing in training helps; the agent must learn an unknown recipe through exploration and feedback. _This is search._

Recipes in this project are **composable functions**: input ingredients at exact grid locations produce a quantity of a target item, and outputs feed other recipes (logs → planks → sticks → fence). Composition depth is the tier semantics, and quantity budgeting makes solutions non-trivial.

The experiment proper is **skill distillation**: an experienced **teacher** agent solves challenges and writes a reusable **skill** (a portable, human-readable procedure file with YAML frontmatter). That skill is copied into a fresh working directory and given to a naive **student** agent, which faces both the taught task and _held-out_ tasks the teacher never saw. We measure whether distilled skills transfer, whether they beat raw transcripts, and how few examples a student needs.

## Headline numbers

- **Skill lift:** student success with a distilled skill vs. without, per tier.
- **Sample efficiency:** student success as a function of examples contained in the skill.
- **Strategy quality:** tool calls and failed attempts per successful craft. Imitation and memorization cost many blind attempts; genuine strategy transfer costs few.
- **Composition depth reached:** how far up the recipe DAG an agent gets on its own.

## How to help

This repo is being built for the [Mistral Vibe hackathon](https://mistral.ai) (July 2026), with a strict **prep/event boundary**: design, specs, contracts and tooling probes are done in advance (that's what you're reading); all implementation happens during the event clock. Ways to contribute now:

- **Review the design.** [`2-project-brief.md`](./2-project-brief.md) (architecture) and [`3-project-plan.md`](./3-project-plan.md) (event-day plan with pre-committed experiment matrix). Issues and push requests welcome.
- **Stress-test the scenario model.** [`docs/scenario-model.md`](./docs/scenario-model.md) defines recipes-as-functions, composition depth, and the tier semantics. If you know Minecraft recipes (or experiment design!), we want holes poked in it.
- **Datasets.** Recipe books per tier, inventories with distractor items, and hidden held-out invented-tier tasks all need designing. Claim a tier, read the contracts in [`packages/contracts/src/scenario.ts`](./packages/contracts/src/scenario.ts), propose data.
- **Judge queries.** Four eval queries reduce to one Cypher statement each ([`docs/graph-schema.cypher`](./docs/graph-schema.cypher)). Better formulations are contributions.
- **Playback (stretch).** An event-log replayer and a mocked crafting-table UI would make results legible to non-engineers.

Open an issue before large changes, so we don't collide with event-day wiring.

## Repo layout

```
├── docs/                    # specs, harness protocol, scenario model, graph schema
├── spikes/                  # tooling probes (S1-S6): honest prep evidence, with verdicts
│                            #   in each sN-notes.md; raw logs tell the same story
├── packages/
│   ├── contracts/           # zod schemas: tool grammar, feedback, event log, scenarios
│   ├── world/               # crafting world model: grid, inventory, shape matching, recipes
│   ├── harness/             # run orchestrator: spawns vibe CLI, isolates dirs, applies conditions
│   ├── analysis/            # eval queries + results tables (event logs / Relate)
│   └── playback/            # event-log replayer, crafting-table UI (stretch)
├── results/                 # run output, event logs, scores (event-day artifact, gitignored)
├── 1-project-pitch.md       # the pitch
├── 2-project-brief.md       # architecture + experiment design
├── 3-project-plan.md        # event-day plan, pre-committed matrix
└── package.json             # pnpm workspace root
```

`packages/contracts` is spec, not implementation: it pins decisions from the brief. Other `packages/*` contain `// EVENT:` stubs where implementation starts on event day.

## Prep / event boundary

| Written before the event (this repo now)        | Written during the event clock        |
| ----------------------------------------------- | ------------------------------------- |
| Design docs, specs, prompt templates            | World model implementation            |
| Zod schemas / types in `packages/contracts`     | Harness orchestration implementation  |
| Tooling configs (pnpm, tsconfig, vitest, biome) | Scenario dataset (recipe books)       |
| Spikes in `spikes/` (probe evidence + verdicts) | Teacher/student runs, skills, results |
|                                                 | Analysis, playback UI, write-up       |

The spike notes are the institutional memory: every locked decision (feedback contract, skill frontmatter gate, anti-cheat rules, event-log parsing rules, Relate rulings) traces to an `sN-notes.md` with raw evidence.

## Setup

```sh
pnpm install               # workspace
pnpm -r test               # vitest
pnpm dev --filter harness  # harness entrypoint (event day)
```

Requirements: Node 18+, pnpm. Event-day runs additionally need the `vibe` CLI (3.1.4) and [Relate](https://github.com/relatedb/relate) v1.2.0+; see [`docs/harness-protocol.md`](./docs/harness-protocol.md).

## License

[Apache-2.0](./LICENSE) © 2026 Andreas Kollegger
