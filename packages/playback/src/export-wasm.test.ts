/** Export + relate-wasm roundtrip: seed a temp results/ (Relate lineage DB +
 *  events.jsonl), run the static export, then load graph.json into an
 *  in-memory relate-wasm DB and run the canonical lineage queries. Node env. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "@relate/relate";
import { afterEach, describe, expect, it } from "vitest";
import { exportStatic } from "../scripts/export-static.mjs";
import { initRelateWasm, LINEAGE_QUERIES, loadLineageDump } from "./relate-wasm";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function seedResults(): { resultsDir: string; outDir: string } {
  dir = mkdtempSync(join(tmpdir(), "playback-export-"));
  const resultsDir = join(dir, "results");
  const outDir = join(dir, "public-data");
  mkdirSync(join(resultsDir, "lineage"), { recursive: true });
  mkdirSync(join(resultsDir, "runs", "t1"), { recursive: true });
  mkdirSync(join(resultsDir, "runs", "s1"), { recursive: true });
  mkdirSync(join(resultsDir, "runs", "s2"), { recursive: true }); // graph-only runs without a dir are now excluded
  writeFileSync(join(resultsDir, "runs", "t1", "events.jsonl"), '{"ts":"2026-11-21T10:00:00.000Z","seq":0,"kind":"run_start","payload":{}}\n');
  writeFileSync(join(resultsDir, "runs", "s1", "events.jsonl"), '{"ts":"2026-11-21T10:05:00.000Z","seq":0,"kind":"run_start","payload":{}}\n');

  const db = Database.open(join(resultsDir, "lineage"));
  const c = db.connect();
  const run = (id: string, p: Record<string, unknown>) =>
    c.query(
      `MERGE (r:Run {runId: $id}) SET r.role=$role, r.condition=$condition, r.taskId=$taskId, r.tier=$tier, r.heldOut=$heldOut, r.outcome=$outcome, r.toolCalls=$toolCalls, r.failedAttempts=0, r.durationMs=1`,
      { id, ...p },
    );
  run("t1", { role: "teacher", condition: null, taskId: "item:bar", tier: "invented", heldOut: false, outcome: "success", toolCalls: 6 });
  run("s1", { role: "student", condition: "skill", taskId: "item:bar", tier: "invented", heldOut: false, outcome: "success", toolCalls: 3 });
  run("s2", { role: "student", condition: "none", taskId: "item:bar", tier: "invented", heldOut: false, outcome: "fail", toolCalls: 6 });
  c.query("CREATE (s:Skill {skillId: 'sk1', classification: 'procedure', exampleCount: 2})");
  c.query("MATCH (a:Run {runId:'t1'}), (b:Skill {skillId:'sk1'}), (c:Run {runId:'s1'}) CREATE (a)-[:GENERATED]->(b)-[:USED_IN]->(c)");
  c.query("CREATE (r:Recipe {recipeId: 'hidden-answer'})"); // must NOT be exported (anti-cheat)
  db.checkpoint();
  return { resultsDir, outDir };
}

describe("exportStatic + relate-wasm roundtrip", () => {
  it("exports runs.json, graph.json (no recipes), and events copies", () => {
    const { resultsDir, outDir } = seedResults();
    const stats = exportStatic(resultsDir, outDir);
    expect(stats.runs).toBe(3);
    expect(stats.pairs).toBe(1);
    expect(stats.eventsCopied).toBe(2);

    const runsJson = JSON.parse(readFileSync(join(outDir, "runs.json"), "utf8"));
    expect(runsJson.source).toBe("static");
    expect(runsJson.runs.find((r: any) => r.runId === "s1").file).toBe("data/runs/s1.jsonl");
    expect(runsJson.pairs).toEqual([{ teacherRunId: "t1", skillId: "sk1", studentRunId: "s1" }]);
    expect(existsSync(join(outDir, "runs", "s1.jsonl"))).toBe(true);

    const graph = JSON.parse(readFileSync(join(outDir, "graph.json"), "utf8"));
    expect(graph.nodes.every((n: any) => ["Run", "Skill", "Task"].includes(n.labels[0]))).toBe(true);
    expect(JSON.stringify(graph)).not.toContain("hidden-answer");
  });

  it("relate-wasm answers the canonical lineage queries on the exported graph", async () => {
    const { resultsDir, outDir } = seedResults();
    exportStatic(resultsDir, outDir);
    const graph = JSON.parse(readFileSync(join(outDir, "graph.json"), "utf8"));
    // node has no fetch-for-files; init the wasm module from explicit bytes
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("@relate/relate-wasm/relate_bg.wasm");
    await initRelateWasm({ module_or_path: readFileSync(wasmPath) });
    const db = await loadLineageDump(graph);

    const pairs = db.query(LINEAGE_QUERIES[0]!.cypher);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ teacher: "t1", skill: "sk1", student: "s1", outcome: "success" });

    const lift = db.query(LINEAGE_QUERIES[1]!.cypher);
    const byCond = Object.fromEntries(lift.map((r) => [r.condition, r]));
    expect(Number(byCond.skill.successRate)).toBe(1);
    expect(Number(byCond.none.successRate)).toBe(0);
    expect(Number(byCond.skill.avgMoves)).toBe(3);
  });
});
