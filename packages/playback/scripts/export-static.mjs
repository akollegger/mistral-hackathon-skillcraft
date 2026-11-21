/** Export results/ into a static, gh-pages-shippable data bundle in public/data/:
 *
 *   public/data/runs.json          run index + skill pairs (same shape as /api/runs)
 *   public/data/graph.json         shippable lineage graph (Run/Skill/Task nodes +
 *                                  GENERATED/USED_IN/ATTEMPTED/SCORED_BY edges; recipes
 *                                  excluded per anti-cheat rule 5) for relate-wasm
 *   public/data/runs/<runId>.jsonl replay streams (events.jsonl copies)
 *
 * Usage: node scripts/export-static.mjs [resultsDir] [outDir]
 * Defaults: resultsDir = ../../results (repo root), outDir = ../public/data.
 * Run AFTER judging — the output is meant for the public gh-pages site.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRelateGraph, readRelateIndex } from "../src/relate-index.ts";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const resultsDir = resolve(process.argv[2] ?? join(pkgDir, "../../results"));
const outDir = resolve(process.argv[3] ?? join(pkgDir, "public/data"));

export function exportStatic(resultsDir, outDir) {
  const relate = readRelateIndex(resultsDir);
  if (!relate) throw new Error(`no Relate lineage DB at ${join(resultsDir, "lineage")}`);
  const graph = readRelateGraph(resultsDir);

  // Replay streams: copy each run's events.jsonl.
  const runsDir = join(resultsDir, "runs");
  const dataRunsDir = join(outDir, "runs");
  mkdirSync(dataRunsDir, { recursive: true });
  const eventsCopied = [];
  if (existsSync(runsDir)) {
    for (const runId of readdirSync(runsDir)) {
      const src = join(runsDir, runId, "events.jsonl");
      if (existsSync(src)) {
        cpSync(src, join(dataRunsDir, `${runId}.jsonl`));
        eventsCopied.push(runId);
      }
    }
  }

  const runs = relate.runs.map((r) => ({ ...r, file: `data/runs/${r.runId}.jsonl` }));
  writeFileSync(join(outDir, "runs.json"), JSON.stringify({ source: "static", runs, pairs: relate.pairs }, null, 2));
  if (graph) writeFileSync(join(outDir, "graph.json"), JSON.stringify(graph));
  return { runs: runs.length, pairs: relate.pairs.length, graphNodes: graph?.nodes.length ?? 0, eventsCopied: eventsCopied.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const stats = exportStatic(resultsDir, outDir);
    console.log(`exported to ${outDir}:`, JSON.stringify(stats));
  } catch (e) {
    console.error(`export failed: ${e.message}`);
    process.exit(1);
  }
}
