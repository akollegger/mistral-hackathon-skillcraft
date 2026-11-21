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

export interface GraphNode {
  eid: number;
  labels: string[];
  props: Record<string, unknown>;
}
export interface GraphEdge {
  from: number;
  to: number;
  type: string;
}
export interface GraphDump {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Labels/types we are willing to ship to a public static site. Recipe/Book/Item
// nodes are deliberately excluded (anti-cheat rule 5: answer material stays local).
const SHIPPABLE_LABELS = new Set(["Run", "Skill", "Task"]);
const SHIPPABLE_EDGES = new Set(["GENERATED", "USED_IN", "ATTEMPTED", "SCORED_BY"]);

const GRAPH_CYPHER = `
MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)
OPTIONAL MATCH (n)-[r]->(m)
RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props,
       id(m) AS toId, type(r) AS relType
`;

/** Full shippable graph dump (nodes + lineage edges) for the wasm demo. */
export function readRelateGraph(resultsDir: string): GraphDump | null {
  const lineage = join(resultsDir, "lineage");
  if (!existsSync(lineage)) return null;
  let db: ReturnType<typeof Database.open>;
  try {
    db = Database.open(lineage, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const conn = db.connect();
    const res = conn.query(GRAPH_CYPHER, {
      labels: [...SHIPPABLE_LABELS],
    }) as unknown as { rows: Record<string, unknown>[] };
    const nodes = new Map<number, GraphNode>();
    const edges: GraphEdge[] = [];
    for (const row of res.rows) {
      const id = Number(row.id);
      if (!nodes.has(id)) {
        nodes.set(id, {
          eid: id,
          labels: (row.labels as string[]).filter((l) => SHIPPABLE_LABELS.has(l)),
          props: (row.props as Record<string, unknown>) ?? {},
        });
      }
      if (row.toId !== null && row.relType && SHIPPABLE_EDGES.has(row.relType as string)) {
        edges.push({ from: id, to: Number(row.toId), type: row.relType as string });
      }
    }
    return { nodes: [...nodes.values()], edges };
  } catch {
    return null;
  }
}

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
    const runs: RunSummary[] = [];
    for (const r of rows) {
      const runId = String(r.runId);
      // Skip runs whose directory is gone (archived/moved): the graph can lag
      // behind the filesystem, but the UI should reflect what's on disk now.
      let startedAt: string | null = null;
      try {
        startedAt = statSync(join(resultsDir, "runs", runId)).mtime.toISOString();
      } catch {
        continue; // run dir missing → archived, exclude
      }
      runs.push({
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
      });
    }
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
