# S6 notes — end-to-end walkthrough: teacher → skill → cold students

## Verdict

**PASS, GREEN, CLOSED (2026-11-20, ~19:03Z).** The full pipeline ran end to end
in ~2.5 minutes wall-clock (56 + 46 + 30 s of run time for teacher + two students).

Per-run results (torch challenge, S2 world, toy task n=1 each):

| Run           | Exit | Elapsed | Craft-tool calls                     | Torch crafted | skill.read | File hunts |
| ------------- | ---- | ------- | ------------------------------------ | ------------- | ---------- | ---------- |
| Teacher       | 0    | 56s     | 46 (44 place + 2 craft)              | yes           | n/a        | n/a        |
| Student-none  | 0    | 46s     | 14 (11 place, 2 craft, 1 clear_grid) | yes           | 0          | 0          |
| Student-skill | 0    | 30s     | 4 (2 place, 2 craft)                 | yes           | 1          | 0          |

- Teacher solved via 44 systematic place probes (heavy feedback-driven search), then
  wrote `skill-output/SKILL.md` with valid frontmatter. The skill quality followed the
  rubric: discovery method ("craft() error reveals inventory"), wouldProduce-based
  pruning, slot-priority heuristics, worked example, general patterns. No bare answer dump.
- Harvest + frontmatter gate + cold-dir injection worked first try in shell.
- Student-skill loaded the skill (`skill.read` effect, zero file hunts — S5 auto-load
  confirmed in the real pipeline) and executed exactly the skill's 4-call sequence,
  including the trick of one failing `craft()` to reveal inventory. Its own reasoning:
  "the skill's example shows the exact same sequence."
- Phenomenon signal at toy scale: 14 → 4 tool calls (none → skill) and 46 → 30s.
  Exactly the sample-efficiency story the event experiment will measure properly.

## Parser rulings for the event (locked)

- **toolName is namespaced**: craft effects appear as `mcp_skillcraft_s6.place` etc.
  (pattern `mcp_<server>_<tool>`), NOT the bare tool name — the S6 analysis greps that
  counted 0 are the cautionary tale. The event-log parser must match the `mcp_`
  prefix/suffix, not equality on `place`.
- **MCP calls ride inside run_typescript**: toolCallIds like `typescript:7:...:tool:2` —
  one agent turn can batch many tool calls in one program. Metrics must count
  individual tool effects, not turns.
- export.json meta shape confirmed per run (outcome, session_id, usage), harvestable.

## Harness pattern confirmed

- Craft MCP: user-scope register BEFORE batch, remove immediately after (done, clean).
- No serve during the batch. Frontmatter gate = skill acceptance. skill.read is a
  first-class strategy event; file_read on SKILL.md is its separate signal (0 here).

## Raw evidence

`s6-raw.log` (large; note the analysis section's zero counts are the grep-pattern bug
documented above, not run failures).
