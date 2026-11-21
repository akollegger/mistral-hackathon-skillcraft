# Spikes (throwaway)

Tooling probes only. Each spike answers one question; the verdicts and locked
decisions live on in docs/. Originally scoped as delete-before-event throwaways,
now committed in full as honest prep evidence (2026-11-21): each `sN-notes.md` is
the citation for a ruling, and the raw logs are the proof. Delete from the event-day
working copy if you want a clean tree; the rulings stay transcribed in docs/.

## Spike checklist

- [x] **S1 — vibe one-shot spawn:** CLOSED, green (see `s1/`). Headless spawn via
      `--prompt-file --workdir --trust --output json` verified; export.json + session/ on disk.
- [x] **S2 — tool protocol:** CLOSED, green. Headless runs drive stdio MCP craft tools;
      state persists per session; `--output json` effects = the event source (journal only as
      fallback). One design fix: errors must also return full feedback. See `s2/s2-notes.md`.
- [x] **S3 — Relate from TS:** CLOSED, green (see `s3/s3-notes.md`). In-process
      `@relate/relate` client works: full lineage shape, unique constraints, all 4 eval
      queries (avg() numeric cast required), `$param` support, sub-ms latency, durable
      reopen. Server surfaces (serve/MCP) stay out of the harness — S4/anti-cheat territory.
- [x] **S4 — Relate MCP into Vibe:** CLOSED, RED — agent-side MCP ruled out (see
      `s4/s4-notes.md`). `vibe mcp add` is user-scope-only and leaks a banner into every
      spawned run; Vibe's MCP client is OAuth-only and cannot auth to a Basic-auth Relate
      headlessly. Harness-side in-process Relate (S3) is the only event path; analysis
      agents shell out to the `relate` CLI instead. serve cleanup verified clean.
- [x] **S5 — skill install path:** CLOSED, green (see `s5/s5-notes.md`). Skills land at
      `<dir>/.agents/skills/<name>/SKILL.md`, REQUIRE YAML frontmatter; with frontmatter the
      skill truly auto-loads for a cold student (catalog entry → `skill.read` effect → content
      in-context), distinctly traceable from file-hunting reads. Ambient runs carry no skill
      content (catalog-only, size 0); official runs still move `~/.vibe/skills` aside.
- [x] **S6 — end-to-end walkthrough:** CLOSED, PASS (see `s6/s6-notes.md`). Full
      teacher → skill → cold-student pipeline green in ~2.5 min: teacher crafts via 46
      feedback-driven probes, writes a rubric-compliant SKILL.md; harvest + frontmatter
      gate + injection work; cold skill student loads it (skill.read, no file hunts) and
      beats the none student 4 vs 14 tool calls. Parser rulings locked: namespaced
      `mcp_<server>_<tool>` toolNames; count tool effects, not turns.

## Recording

Each spike gets a `sN-notes.md` with: verdict, gotchas, exact commands, and a canonical
snippet if it will be rewritten at the event anyway. Keep snippets in the harness spec at
`docs/` only if they are genuinely spec-level.
