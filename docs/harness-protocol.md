# Harness protocol spec (pinned prompts + directory layout)

## Directory layout (event-day, under `results/`)

```
results/
  recipes/                        # hidden ground truth (never shown to any agent)
    traditional.book.json         # EVENT: generate (canonical recipes)
    derived.book.json             # EVENT: stool etc. + acceptable patterns + partial credit
    invented.book.json            # EVENT: foo/meh/fiz -> bar, + held-out invented tasks
  runs/
    <runId>/
      prompt.md                   # rendered prompt (scenario + condition injection)
      events.jsonl                # per contracts/event-log.ts
      dir/                        # the agent's isolated working directory
        work/                    # agent's own workspace
        skill.md                  # teacher output / copied-in student input
        transcript.md             # teacher transcript / copied-in student condition input
      skill.meta.json             # skill artifact metadata (contracts/scenario.ts)
      run.meta.json               # RunMeta on completion
  analysis/                       # derived tables, written by packages/analysis
```

## Canonical one-shot spawn (confirmed by spike S1, mistral-vibe 3.1.4 source)

```
vibe --prompt-file <runDir>/prompt.md --workdir <runDir>/dir \
  --trust --approval-policy auto-approve \
  --output-dir <runDir> --output json \
  --time-limit <T> --max-turns <N> --model <ALIAS-pinned-per-matrix>
```

Exit codes: 0 finished; 1 usage/config error; 2 infra failure; 3 limits/timeout/refusal; 4 aborted.
`--output-dir` writes `export.json` (config, token usage, cost, stop reason, outcome) plus the
`session/` journal copy per run — transcripts and telemetry come from the CLI itself.

**Event source (decided by spike S2):** the harness parses the `--output json` stdout array —
`effect` entries with `kind: "tool"` carry `toolName`, `input`, `state.status`, `state.outputText` —
mapping 1:1 onto the event-log schema. The `session/journal` (hash-chained recovery records) is a
fallback only. Tool results (including errors) always carry the full feedback object
`{craftable, wouldProduce, grid, inventory}` — that is how agents learn state, per the brief.

## Prompt templates (decided shapes; scenario text is event-day)

**Teacher** (role: teacher, condition: null):

1. Task statement: inventory (ids + quantities), target item, 3x3 grid explanation.
2. Tool description: place/take/clear/craft + feedback contract ("every action tells you
   whether your current grid is craftable and what it would produce").
3. Teaching phase: "You solved it. Write a reusable skill file at `skill.md` that
   teaches another agent to handle challenges like this one."
4. Skill rubric: procedures and strategies beat answers (how to search, how to read the
   feedback, pruning heuristics); worked examples allowed and encouraged; no hidden-channel hints.

**Student** (role: student, condition: none|transcript|skill):

- Identical to teacher items 1-2. Condition injection, verbatim placement order:
  - none: nothing added.
  - transcript: `transcript.md` path, "an agent previously worked on a related problem; this is its raw transcript."
  - skill: `skill.md` path, "a previous agent distilled its experience into this skill."
- No task-specific hints leak through condition injection phrasing (word-matched stems).

## Tuning knobs (record in run.meta.json, never silently varying)

- Vibe CLI invocation flags, model/pinning date, timeout budget per run, max tool calls.
- Grid dimensions and repetition counts come from the pre-committed matrix in the plan (P4).

## Skill-inject decisions (post-S5)

- Dir-local skills live at `<dir>/.agents/skills/<name>/SKILL.md`; the loader REQUIRES
  YAML frontmatter (`name`, `description`) — files without it fail with
  "Missing or invalid YAML frontmatter". Teacher skill-generation prompt must mandate
  frontmatter, and the harness validates it at acceptance time (reject non-compliant skills).
- Student `file_read` effects on the SKILL.md path is a traceable strategy event:
  S5 showed a cold run can succeed by _hunting and reading_ the skill as a plain file
  even when skill loading failed — distinguish auto-load vs file-hunt in the event log.
- Ambient skills (`ls ~/.vibe/skills`, e.g. the relate bundle) are recorded in
  run.meta.json and the directory is moved aside during official runs, restored after.
- Separate the two contamination conditions in analysis: loaded skill vs read-as-file.

## Relate compartmentalization rules (anti-cheat; post-S4 design review)

Relate is a HARNESS-side facility only, embedded in-process via `@relate/relate`.
Teachers and students must never reach the graph DB during their runs — otherwise
tier results measure database archaeology instead of retrieval/transfer/search.

1. **No MCP config in run dirs.** Teacher/student workdirs contain only the craft-tools
   stdio MCP the harness spawns. The harness asserts the absence of any `vibe` MCP
   entries in each run dir before spawning.
2. **NO Vibe MCP registration at all (strengthened post-S4).** `vibe mcp add` writes
   USER config only (no project scope in vibe 3.1.4) and leaks a startup banner into
   every spawned run; it is forbidden on the event machine. Vibe's MCP client is
   OAuth-only and cannot authenticate to a Basic-auth Relate headlessly, so the agent-side
   MCP path is unusable anyway. Analysis agents needing Cypher shell out to the
   `relate` CLI (loopback, `--safe`, `--auth` via env), used only during analysis phases.
3. **Contamination = hard fail, detected.** Any run whose `--output json` effects contain
   a relate/cypher `toolName` is voided and logged as `CONTAMINATED` (kept for analysis,
   excluded from results, rerun allowed within budget).
4. **Ambient manifests in run.meta.json:** both `~/.vibe/skills` contents and ambient MCP
   registrations are recorded per run; the skills dir is moved aside during official runs
   (S5 rule), which also removes the relate skill from the catalog.
5. **Answer-key minimization:** solutions for held-out invented-tier tasks are written to
   the graph only AFTER scoring that run, so a mid-run leak cannot reach an answer that
   is not there yet.
6. **`relate serve` never runs during experiment batches (post-S4).** Every spawned run
   owns bash and the `relate` CLI is on PATH; an open loopback server is reachable from
   inside any run. The serve process runs only in analysis phases; the harness asserts
   ports 7474/7475 are closed before spawning teacher/student runs. Contamination rule
   (3) catches the residual risk: any relate/cypher tool effect — MCP or bash — in an
   experiment run voids it as CONTAMINATED.

## Event-log parser rulings (post-S6 walkthrough)

- Craft tool effects carry NAMESPACED toolNames: `mcp_<server>_<tool>` (e.g.
  `mcp_skillcraft_s6.place`). The event-log schema parses by suffix match on the
  registered server name, never equality with the bare tool name.
- MCP tool calls are made inside `run_typescript` programs (toolCallIds like
  `typescript:7:...:tool:2`); one turn may batch several tool calls. Metrics
  (toolCalls, failedAttempts) count individual tool effects, not agent turns.
- Confirmed pipeline timings (toy tier, vibe 3.1.4): teacher solve+write 56s,
  cold student 30-46s. Budget ~2.5 min per teacher/student pair; scale to the
  pre-committed matrix accordingly.
