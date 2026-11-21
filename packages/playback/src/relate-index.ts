/** Relate-backed run index (Node-only — imported by vite.config.ts and tests,
 *  never by browser code). Reads the embedded lineage DB at
 *  <resultsDir>/lineage written by the harness (packages/harness/src/relate.ts).
 *  Replay itself still reads events.jsonl only (docs/demo-matrix.md); this is
 *  the metadata/lineage view: Run nodes + GENERATED/USED_IN edges. */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Database } from "@relate/relate";
import type { RunSummary } from "./runs";

export interface SkillPair {
  teacherRunId: string;
  skillId: string;
  studentRunId: string;
}

export interface RelateIndex {
  runs: RunSummary[];
  pairs: SkillPair[];
}

const RUNS_CYPHER = `
MATCH (r:Run)
RETURN r.runId AS runId, r.role AS role, r.condition AS condition, r.taskId AS taskId,
       r.tier AS tier, r.heldOut AS heldOut, r.outcome AS outcome, r.toolCalls AS toolCalls,
       r.failedAttempts AS failedAttempts, r.durationMs AS durationMs
`;

const PAIRS_CYPHER = `
MATCH (t:Run {role: 'teacher'})-[:GENERATED]->(s:Skill)-[:USED_IN]->(u:Run)
RETURN t.runId AS teacherRunId, s.skillId AS skillId, u.runId AS studentRunId
`;

/** Read runs + skill pairs from the lineage DB. Null when no DB exists. */
export function readRelateIndex(resultsDir: string): RelateIndex | null {
  const lineage = join(resultsDir, "lineage");
  if (!existsSync(lineage)) return null;
  let db: ReturnType<typeof Database.open>;
  try {
    // readOnly: coexists with the harness's writer handle on the same path,
    // and a missing store is not created.
    db = Database.open(lineage, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const conn = db.connect();
    // conn.query returns a result object; rows live under .rows (per harness relate.ts)
    const rows = (conn.query(RUNS_CYPHER) as unknown as { rows: Record<string, unknown>[] }).rows;
    const pairRows = (conn.query(PAIRS_CYPHER) as unknown as { rows: Record<string, unknown>[] }).rows;
    const runs: RunSummary[] = rows.map((r) => {
      const runId = String(r.runId);
      // startedAt: Run nodes carry no ts; use the run dir mtime (JSONL fallback
      // uses the first event ts). Keeps "most recent first" ordering working.
      let startedAt: string | null = null;
      try {
        startedAt = statSync(join(resultsDir, "runs", runId)).mtime.toISOString();
      } catch {
        /* run dir missing */
      }
      return {
        runId,
        role: String(r.role ?? "?"),
        condition: (r.condition as string | null) ?? null,
        taskId: String(r.taskId ?? "?"),
        tier: (r.tier as string | undefined) ?? undefined,
        heldOut: (r.heldOut as boolean | undefined) ?? undefined,
        outcome: (r.outcome as string | null) ?? null,
        modelAlias: undefined,
        toolCalls: (r.toolCalls as number | undefined) ?? undefined,
        startedAt,
        file: undefined,
      };
    });
    runs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
    const pairs: SkillPair[] = pairRows.map((p) => ({
      teacherRunId: String(p.teacherRunId),
      skillId: String(p.skillId),
      studentRunId: String(p.studentRunId),
    }));
    return { runs, pairs };
  } catch {
    return null;
  }
  // v1.2.0 has no close(); read-only handles are released on GC, and
  // checkpoint() is refused on read-only handles anyway.
}
