# S4 notes — Relate MCP into Vibe (analysis agents ONLY)

## Verdict

**RED, CLOSED (2026-11-20).** Agent-side Relate over MCP is RULED OUT for the event.
All three checkpoints failed; the failures are conclusive, not incidental:

- **CP1a FAIL — `vibe mcp add` writes USER config only.** Help text: "Add an MCP
  server to the user configuration". The detected `--scope` flag is OAuth scopes,
  NOT config scoping (red herring). Our add touched `~/.vibe/connector_bootstrap_cache.json`.
  There is no project-scope MCP registration in vibe 3.1.4.
- **CP1b FAIL — registration leaks to every run.** A bare student-like spawn in a
  sibling dir printed "MCP server 'relate-shared' needs OAuth authentication" at
  startup. User-scoped registrations are visible in ALL spawned runs.
  (The leak-based grep also caught the ambient `relate` skill in the skills catalog —
  the known, already-handled contamination; see S5.)
- **CP2 FAIL — no Cypher roundtrip.** Vibe's MCP client attempted OAuth against our
  HTTP Basic-auth server and failed (401 "authentication required"); the analysis
  run's `search_tool_functions` probes returned 0 relate tools, and the run ended at
  `turn_limit` (exit 3) while pawing through `~/.vibe`. Vibe's MCP surface is
  OAuth-only: a headless run cannot authenticate to an auth'd Relate.

Mitigating finding: an auth'd Relate is UNUSABLE by spawned agents (headless runs
cannot complete OAuth), so a leaked registration is visible-but-impotent. Still
unacceptable for official runs.

## Decisions locked by this spike

1. **No `vibe mcp add` on the event machine, ever.** It is user-scope only and leaks
   into every spawned run. The anti-cheat rule is strengthened from "project scope
   only" to "no MCP registration at all".
2. **Harness-side in-process Relate (S3) is the only event path** for lineage writes
   and eval queries.
3. **Analysis agents get Cypher via the `relate` CLI in bash, not MCP**: loopback,
   `--safe`, `--auth` from env vars, e.g.
   `relate query --database <store> --auth "$RELATE_AUTH" 'MATCH (n) RETURN count(n)'`
   (exact query-session syntax to be confirmed from `relate query --help` at the event).
4. Contamination detection preserved: any relate/cypher OUTPUT effect in a
   teacher/student run = CONTAMINATED (runs own the relate CLI too via bash, so the
   detection rule matters even without MCP).
5. Ambient skill catalog (`~/.vibe/skills/relate`) reminder: the S5 move-aside rule
   removes both the catalog entry and the how-to knowledge in one move.
6. Cleanup verified: `vibe mcp remove relate-shared` works (exit 0, "Removed"),
   serve SIGTERM closes ports cleanly.

## Open detail (settle at event, non-blocking)

- `relate query --help` exact flags for one-shot CLI queries (params, output format).
- Whether spawned teacher/student runs can even reach the loopback server: they also
  own bash, so the port + auth + serve-not-running-during-experiment-runs rule
  applies. Default: `relate serve` runs ONLY during analysis phases, not during
  teacher/student experiment batches.

## Raw evidence

`s4-raw.log`; side files `vibe-mcp-help.txt`, `vibe-mcp-add-help.txt`.
