# S5 notes — skill install path, ambient load, dir-local injection

## Verdict — GREEN, CLOSED (2026-11-20; S5b run completed)

### S5b result: TRUE AUTO-LOAD (clean branch of the verdict rule)

- **0 file reads** on the run (no `.agents` crawl), answer **wisteria-cobra** correct.
- Log shows a `skill.read` effect: `"Loading skill: distill-probe"` returning the full
  `<skill_content>` body in-context; model then quotes the skill's table directly.
- Mechanism: skills surface as a **catalog entry (name + description)**; the model
  invokes the `skill` tool; content loads in-context. The `skill.read` effect is a
  first-class event, cleanly distinct from `file_read` effects.
- Usage: 13,565 input (7,808 cached) / 139 output, exit 0, finished.
- **Ambient contamination settled:** bare-run context-breakdown shows exactly 1
  skill-related entry of size 0 — no relate-bundle _content_ enters bare runs
  (catalog mention at most). Official runs still move `~/.vibe/skills` aside.

1. **Skill placement confirmed.** `relate update` wrote the bundle to
   `~/.vibe/skills/relate/SKILL.md` (v1.2.0, with frontmatter) and also created dirs
   for `~/.claude/skills`, `~/.cursor/skills`, `~/.gemini/skills`. A pre-existing
   `~/.agents/skills/find-skills` skill exists too.
   → Run-dir-local skills live at `<dir>/.agents/skills/<name>/SKILL.md`. Confirmed by
   the loader's own error message referencing exactly that path.

2. **Skills REQUIRE YAML frontmatter to load as skills.** The injection SKILL.md
   (no frontmatter) failed: _"Failed to load: Missing or invalid YAML frontmatter
   (metadata section must start and end with ---)"_. → **Confirmed hard requirement
   by S5b**: with frontmatter the same injection loads cleanly via `skill.read`.
   Teacher skill-generation prompt must mandate frontmatter (`name`, `description`).

3. **The injection test "passed" — but via file-hunting, not skill loading.** Because
   the skill failed to load, the model answered **wisteria-cobra** only after 5
   `file_system.read_file` calls crawling `.agents/ → skills/ → distill-probe/ →
   SKILL.md`. The answer is correct, but the mechanism is _find-and-read_, not
   _loaded skill_. Both are legitimate behaviors to measure, but they are different
   conditions — and file-hunting depends on the prompt implicitly encouraging search.

4. **`--trust` bypasses the project-config trust prompt headlessly** — the run with
   `.agents/` config present completed with zero trust records. Confirmed.

5. **Ambient contamination: probably benign, not yet proven.** Bare trivial run:
   6,596 input tokens (vs 13,236 for S1's harder write task — lower, so the relate
   bundle is likely NOT auto-injected wholesale into context; likely only a catalog
   entry). Not conclusive: S5b re-checks with the context-breakdown contents, and the
   harness will still move `~/.vibe/skills` aside during official runs as a rule.

## S5b — run outcome summary

Ran `run2.sh` (valid frontmatter: name/description/version on SKILL.md): true auto-load.
See "Verdict" above; raw evidence below.

## Design decisions already locked by this spike

- Teacher skill prompt template gains a hard requirement: YAML frontmatter with name +
  description + version; harness validates frontmatter before accepting a skill
  (frontmatter regex check, part of P3's manual 2-min check).
- The harness records the ambient-skills manifest at run time (`ls ~/.vibe/skills`)
  and renames the directory aside for official runs, restoring after; ambient state
  goes into run.meta.json.
- Skill artifacts have TWO traceable fates: (a) loadable skill with frontmatter,
  (b) readable file — and both showed up in one log. The event log should record
  whether the student read the SKILL.md as a file (`file_read` effects on that path),
  since that's itself a measurable strategy difference.

## Raw evidence

`s5-raw.log`, `s5-raw2.log` (S5b).
