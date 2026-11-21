# S2 notes — tool protocol

## Verdict — CLOSED (live run 2026-11-20, green)

**Headless vibe runs can discover and drive our stdio MCP craft tools. World state
persists across calls within a session. And the `--output json` stdout stream is the
event source we should parse — far cleaner than the journal.**

## What happened in the run (worth reading closely)

The model (mistral-medium-3.5 default):
1. Found the tools itself via the CLI's built-in `search_tool_functions`, which surfaced
   the `mcp_skillcraft_s2` connector (tools are namespaced `mcp_skillcraft_s2.place` etc.).
2. **Failed 8 times in a row guessing item names** ("coal", "charcoal", "stick", "torch",
   "wood", "planks", "log", "stone") — the inventory held `minecraft:coal`,
   `minecraft:stick`, but the spike prompt never listed it, so the model had to discover it.
3. Then called `clear_grid()` and — because the feedback contract returns inventory on
   **every** action — learned the full inventory from that response.
4. Placed coal (slot 1), stick (slot 4) — feedback flipped to `craftable: true,
   wouldProduce: "minecraft:torch"` — then `craft()` → `success: true, produced:
   minecraft:torch`. Total 27s, exit 0.

Step 2→3 is exactly the search-strategy behavior Skillcraft measures: feedback-driven
discovery, pruning, and recovery. The spike accidentally validated the whole premise.

## Findings

- [x] Sanity handshake + tools/list works standalone (Node v24.14.1, zero deps).
- [x] `vibe mcp add <name> --transport stdio --command node --arg <path>` registers;
      `vibe mcp remove <name>` cleans up. Requires no server-side auth.
- [x] Model discovers and drives MCP tools headlessly; approval metadata
      (`approvalSource: "bypass"`, `approvalType: "always"`) is recorded per call.
- [x] **State persists** across tool calls within a session (one server process per run —
      exactly the isolation model the harness needs: fresh process = fresh world).
- [x] **Event source decision: `--output json` stdout.** The final array contains typed
      entries: `message` (user/assistant), `reasoning` (text), `effect` (tool calls with
      `detail.toolName`, `detail.input`, `state.status`, `state.outputText`,
      `state.durationMs`). This maps 1:1 onto `contracts/event-log.ts` kinds.
      The `session/journal/*.jsonl` is a hash-chained recovery journal (sequence,
      record_sha256, action_intent/action_result with arguments_json) — parse only if we
      ever need below-effect granularity (e.g., exact completion requests).
- [x] MCP tool errors are surfaced to the model as `mcp_tool_error` with the server's text;
      the model read them and adapted. `isError` does not kill the run.
- [x] Cost/time: 27s wall for a 20-turn-budget run with 12 tool calls + reasoning.

## Design corrections carried into the real build

1. **Feedback contract violation found in the spike server:** error responses
   (`no coal in inventory`) returned only `{error}` WITHOUT grid/inventory. The real
   server must return the full feedback object on EVERY action, success or error —
   that's how the model learned state, and per the brief the contract says every
   place/take returns craftability + state. Fix: every tool result, including errors,
   includes `{craftable, wouldProduce, grid, inventory}`.
2. **Inventory in the task prompt is a deliberate variable, not an omission.** The spike
   prompt (no inventory) produced 8 failed probes — that's a *hard task* variant. The
   harness protocol's standard task statement includes inventory ids + quantities; the
   "blind inventory" variant is exactly the kind of tier/difficulty knob to keep in the
   scenario spec, deliberately.
3. **Event-log parser:** parse `--output json` effects (`kind: "tool"`), map
   `toolName` → op, `input` → args, `outputText` → feedback JSON. Journal only as deep-dive
   fallback. `toolCalls`/`failedAttempts` in RunMeta derive from `state.status` counts.
4. Tool namespacing (`mcp_skillcraft_s2.`) is visible to the model; harmless, but keep
   server names stable across teacher/student (`skillcraft`) so traces compare cleanly.

## Raw evidence

`s2-raw.log` (full run transcript + journal head).
