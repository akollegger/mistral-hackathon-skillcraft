# S3 notes — Relate from TypeScript/Node

## Verdict

**GREEN, CLOSED (2026-11-20T17:39Z rerun).** The harness embeds Relate
**in-process** via the first-party `@relate/relate` npm client — no `relate serve`,
no Bolt, no HTTP. Server surfaces stay for S4 (agent-side MCP).

Findings, per checklist:

- [x] `@relate/relate` installs cleanly (spike-local, Node v24.14.1; "up to date in 273ms").
- [x] Full lineage shape written: Task/Run/Skill/Eval nodes + GENERATED/USED_IN/ATTEMPTED/SCORED_BY edges (1a-2j all green).
- [x] `CREATE CONSTRAINT ... IS UNIQUE` supported (stats show `constraints_added:1` for Task, Run, Skill).
- [x] All four judge-facing queries run as single Cypher statements, correct rows:
      3a lift (skill 1 vs none 0), 3b sample efficiency (3 examples → 1 success),
      3c strategy quality (none: 22 calls/15 failures vs skill: 6/1 — the avg()
      numeric-cast fix works; graphs and analysis code must use
      `avg(CASE WHEN x THEN 1.0 ELSE 0.0 END)` style casts), 3d lineage chain intact.
- [x] Parameterized queries (`$param`) supported ("invented:bar" row returned).
- [x] Latency: sub-millisecond engine time on every query except a 9.1ms first-touch
      sanity query; all writes <= 1.8ms. Node overhead is negligible at event scale.
- [x] Durability: store reopens with all 8 nodes intact.
- [x] Store format: `directory` (WAL-durable). Keep it in results/ (gitignored);
      export a `.rl` bundle or snapshot (json/parquet/markdown) for post-event replay
      rather than committing the live store.
- Relate CLI on the machine is now **v1.2.0** (binary, Apache 2.0).

## Design implications (now locked)

- `packages/harness` gains a `relate` thin wrapper (open, upsertRun, upsertSkill, edge,
  evalQuery) — ~80 lines mapping `contracts/graph.ts` types to Cypher.
- Plan P2 kill criterion is near-trivial: JSON lines still always-on, Relate write path
  is in-process function calls, no server to babysit during the event.
- Keep serve/MCP entirely out of the harness; that surface belongs to S4
  (agent-side, analysis workspace only, per the anti-cheat rules in the protocol).
- RELATE_SAFE_MODE note from `serve --help`: on any future served surface, prefer
  `--safe` and `--auth` on loopback; harness path is unaffected (in-process).

## Raw evidence

See `s3-raw.log`.

## Why the question changed shape

Source read (relatedb/relate README + docs): Relate is a single-binary embedded engine
with per-language first-party clients. The Node.js one is native bindings, Node 18+:

```js
const { Database } = require("@relate/relate"); // or import
const db = Database.open("./store"); // or ":memory:", or a .rl file
const result = db.connect().query("MATCH (p:Person) RETURN p.name");
result.rows;
result.stats;
result.consume().elapsedMs;
```

So the harness-side lineage store never needs a server. HTTP Query API v2 / Bolt / MCP
serve **agent-side** access (S4 territory, and the relate-mistral plugin's own flow).

## Findings to fill in

- [ ] `@relate/relate` installs cleanly on this machine (macOS, arm64/amd64 native binding)?
- [ ] `probe.mjs` runs the full lineage shape: Task / Run / Skill / Eval nodes +
      GENERATED / USED_IN / ATTEMPTED / SCORED_BY edges?
- [ ] `CREATE CONSTRAINT ... IS UNIQUE` supported, or MERGE-idempotency fallback needed?
- [ ] The four judge-facing queries run as single Cypher statements:
      skill lift, sample efficiency, strategy quality, lineage display?
- [ ] Parameterized queries (`$param`) supported on the Node surface?
- [ ] Latency per query (expect sub-millisecond engine time; Node overhead is the cost)?
- [ ] Durability: store reopens with nodes intact (step 5 of run.sh)?
- [ ] Store format: directory (`./scratch/lineage`) — fine to gitignore like results/?
      Or `.rl` single file (better: check into repo for post-event replay of the graph)?

## Design implications if green

(now promoted to the locked list above; original draft kept for provenance)

- `packages/harness` gains a `relate` thin wrapper (open, upsertRun, upsertSkill, edge,
  evalQuery) — ~80 lines mapping `contracts/graph.ts` types to Cypher.
- Kill criterion from plan P2 becomes near-trivial: JSON lines still always-on, Relate
  write path is in-process function calls, no server to babysit during the event.
- Keep serve/MCP entirely out of the harness; that surface belongs to S4 (agent-side).

## Raw evidence

See `s3-raw.log`.
