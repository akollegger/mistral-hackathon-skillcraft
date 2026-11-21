# S1 notes — vibe one-shot spawn

## Verdict

**Installed CLI is now vibe 3.1.4 (Rust CLI)**, matching the source inspected during this
spike. Headless one-shot mode is first-class and fits the harness design directly.
Verified-live confirmation pending one run of `sh spikes/s1/run.sh` (v4).

Canonical harness spawn (run.sh v4 executes exactly this):

```
vibe --prompt-file <runDir>/prompt.md --workdir <runDir>/dir \
  --trust --approval-policy auto-approve \
  --output json --output-dir <runDir> \
  --time-limit <T> --max-turns <N> --model <ALIAS>
```

## Findings (source: 3.1.4 sdist, `vibe/cli-rust/src/`)

### Invocation
- `vibe -p TEXT` / `vibe --prompt TEXT` — headless: send prompt, output response, exit.
- `--prompt-file PATH` — prompt from file; scenario + condition render to `prompt.md`.
- `--workdir DIR` — run in directory; `--trust` skips the folder-trust prompt (automation).

### Approval (blocking question — resolved)
- `--approval-policy NAME`: ask, accept-edits, smart-approve, auto-approve, or custom.
- `--auto-approve` (alias `--yolo`) = approve all tool calls.
- Harness standard: `--approval-policy auto-approve`, recorded in run.meta.json.

### Budgets + model pinning
- `--max-turns N`, `--max-tokens N`, `--max-price USD`, `--time-limit SECONDS`.
- A `--time-limit` exit **writes the export first**, then exits 3 — graceful timeout capture.
- `--model ALIAS`, `--thinking LEVEL` (headless, new sessions only, not saved as defaults).

### Run capture
- `--output text|json|streaming`: `json` = final response as JSON; `streaming` = NDJSON events.
- `--output-dir DIR`: on every exit writes `export.json` (Vibe version, effective config,
  token usage, cost, stop reason, outcome) + session journal copy (`session/`).
  Transcript + telemetry without stderr-scraping.

### Exit codes (`run_export/model.rs`)
0 finished; 1 usage/config error; 2 infrastructure failure; 3 turn/token/price/deadline/
terminated/length/refusal; 4 aborted. Typed codes → trivial harness result classification.

## History (process lesson)
- v2/v3 probes discovered a version skew: probed with 3.1.4 flags against an installed
  2.25.7 argparse CLI → "unrecognized arguments" usage errors (exit 2, 0s elapsed).
  Resolved by upgrading the machine to 3.1.4.
- Lesson: **pin to the installed version and verify against its `--help`**; consider
  `vibe --check-upgrade` freeze at the start of the event and record version in every
  run.meta.json.

## Residual — CLOSED (live run 2026-11-20, s1-raw.log)

- [x] exit=0 + `hello.md` created (`s1-ok`), elapsed **10s** for a trivial one-shot run
- [x] auth working (browser/Mistral provider active, `api.mistral.ai`)
- [x] `export.json` + `session/` confirmed on disk. Shape (key fields for contracts):
  - `outcome` ("finished"), `stop_reason`, `error`, `session_id` (uuid)
  - `usage`: `input_tokens` 13236 / `output_tokens` 162 / `cached_input_tokens` 6528 / `total_tokens`
  - `cost_usd` **0.0123** for a trivial run → full P4 grid is comfortably affordable
  - `steps`: 2 → per-run step/turn telemetry exists
  - `config.active_model`: **mistral-medium-3.5** is the DEFAULT → teacher/student runs
    MUST pass `--model` explicitly or they silently inherit whatever the account default is
  - `config.providers`: mistral + llamacpp (local OpenAI-compatible) — side note for the
    event: an offline llamacpp provider is configured and could serve a cheap local student
    model if we want a second subject
  - `session/` holds `journal`, `generations`, `chunks`, `meta.json`, `CURRENT`,
    `context-breakdown.json`, `scheduled-loops.json` — the journal + generations are the
    transcript/capture sources for contracts/event-log parsing
- [x] 10s elapsed for a 2-step run → full distillation runs with search loops will be
  minutes, not seconds; P3/P4 time budgets in the plan hold

## Implications carried into design

1. **Model pinning is mandatory, not optional**: `--model` on every spawn, recorded in run.meta.json.
2. **`export.json` maps cleanly onto `RunMeta`** (contracts/event-log.ts): outcome, duration,
   tool calls — extend RunMeta with `usage`/`costUsd`/`steps` as pass-through fields.
3. **`session/journal` is the tool-call trace source** — S2 should inspect its format to
   design the event parsing (and confirm whether tool calls are distinguishable there).
4. `vibe run-server` stays parked as a P4 accelerator.

## Raw evidence

- Source: PyPI sdist `mistral_vibe-3.1.4.tar.gz`: `cli.rs` (args), `headless*` (mode),
  `run_export/model.rs` (exit codes).
- Live: `spikes/s1/s1-raw.log` (from run.sh v4 run).
