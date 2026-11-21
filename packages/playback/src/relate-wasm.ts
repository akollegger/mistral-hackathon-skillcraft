/** Browser-side lineage graph via @relate/relate-wasm (in-memory RelateDb).
 *  Loads the static export public/data/graph.json (emitted by
 *  scripts/export-static.mjs) and replays it into an in-memory wasm DB, then
 *  answers Cypher queries — so the deployed gh-pages page offers live,
 *  queryable provenance without a server. */
import init, { RelateDb } from "@relate/relate-wasm";

interface GraphNode {
  eid: number;
  labels: string[];
  props: Record<string, unknown>;
}
interface GraphEdge {
  from: number;
  to: number;
  type: string;
}
interface GraphDump {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Labels/edge types are interpolated into Cypher, so whitelist them hard.
const LABELS = new Set(["Run", "Skill", "Task"]);
const EDGE_TYPES = new Set(["GENERATED", "USED_IN", "ATTEMPTED", "SCORED_BY"]);

export interface LineageDb {
  query: (cypher: string, params?: Record<string, unknown>) => Record<string, unknown>[];
}

let initPromise: Promise<unknown> | null = null;

/** Initialize the wasm module once. Browser: default init (Vite serves the
 *  .wasm via import.meta.url). Node/tests: pass explicit bytes, e.g.
 *  initRelateWasm({ module_or_path: readFileSync(wasmPath) }). */
export function initRelateWasm(input?: Parameters<typeof init>[0]): Promise<unknown> {
  initPromise ??= init(input as never);
  return initPromise;
}

/** Parse one wire envelope ({kind, text, table, ...}) into rows. */
function envelopeRows(envelope: string): Record<string, unknown>[] {
  const env = JSON.parse(envelope) as {
    kind?: string;
    table?: { columns?: string[]; rows?: unknown[][] };
    rows?: Record<string, unknown>[];
  };
  if (Array.isArray(env.rows)) return env.rows;
  const table = env.table;
  if (!table?.columns || !table.rows) return [];
  return table.rows.map((r) => {
    const obj: Record<string, unknown> = {};
    table.columns!.forEach((c, i) => {
      obj[c] = r[i];
    });
    return obj;
  });
}

/** Replay a graph dump into an in-memory relate-wasm DB and return a query handle. */
export async function loadLineageDump(graph: GraphDump): Promise<LineageDb> {
  await initRelateWasm();
  const db = new RelateDb();
  for (const n of graph.nodes) {
    const labels = n.labels.filter((l) => LABELS.has(l));
    if (labels.length === 0) continue;
    db.execute(`CREATE (n:${labels.join(":")} {eid: $eid}) SET n += $props`, JSON.stringify({ eid: n.eid, props: n.props }));
  }
  for (const e of graph.edges) {
    if (!EDGE_TYPES.has(e.type)) continue;
    db.execute(
      `MATCH (a {eid: $from}), (b {eid: $to}) CREATE (a)-[:${e.type}]->(b)`,
      JSON.stringify({ from: e.from, to: e.to }),
    );
  }
  return {
    query: (cypher, params) => envelopeRows(db.execute(cypher, params ? JSON.stringify(params) : null)),
  };
}

/** Fetch a graph.json export and load it (browser entry point). */
export async function loadLineageDb(url = "./data/graph.json"): Promise<LineageDb> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`graph export not found at ${url} (run scripts/export-static.mjs)`);
  return loadLineageDump((await res.json()) as GraphDump);
}

/** Canonical demo queries (docs/graph-schema.cypher). */
export const LINEAGE_QUERIES: { name: string; cypher: string }[] = [
  {
    name: "teacher → skill → student pairs",
    cypher: `MATCH (t:Run {role:'teacher'})-[:GENERATED]->(s:Skill)-[:USED_IN]->(u:Run)
             RETURN t.runId AS teacher, s.skillId AS skill, u.runId AS student, u.outcome AS outcome`,
  },
  {
    name: "skill lift (student success, skill vs none)",
    cypher: `MATCH (r:Run {role:'student'})
             RETURN r.condition AS condition,
                    avg(CASE WHEN r.outcome = 'success' THEN 1.0 ELSE 0.0 END) AS successRate,
                    avg(r.toolCalls) AS avgMoves
             ORDER BY condition`,
  },
];
