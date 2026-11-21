// S3 probe — Relate from TypeScript/Node, in-process.
// Answers:
//   1. Does @relate/relate (first-party native binding) work on this machine?
//   2. Can it hold the Skillcraft lineage model (docs/graph-schema.cypher)?
//   3. Do the four judge-facing eval queries run as single Cypher statements?
//   4. Latency per query (Harness P2 budget: the Relate write path must be cheap).
//   5. Open questions: parameterized queries? CREATE CONSTRAINT? (probed, recorded)
import { Database } from "@relate/relate";
import { rmSync, mkdirSync } from "node:fs";

const STORE = "./scratch/lineage";
rmSync(STORE, { recursive: true, force: true });
mkdirSync("./scratch", { recursive: true });

const db = Database.open(STORE);
const conn = db.connect();
const results = [];
function record(step, elapsed, note = "") {
  results.push({ step, ms: elapsed, note });
  console.log(`[${String(elapsed).padStart(5)}ms] ${step}${note ? " — " + note : ""}`);
}
async function q(step, cypher, params) {
  const t = performance.now();
  const r = params ? conn.query(cypher, params) : conn.query(cypher);
  const ms = (performance.now() - t).toFixed(1);
  record(step, ms, r.stats ? `stats=${JSON.stringify(r.stats).slice(0, 80)}` : "");
  return r;
}

// 0. engine sanity
await q("0 sanity RETURN 1+2", "RETURN 1 + 2 AS sum");

// 1. constraints (does Relate support them? either way, MERGE works as fallback)
try {
  await q("1a constraint Task", "CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.taskId IS UNIQUE");
  await q("1b constraint Run", "CREATE CONSTRAINT run_id IF NOT EXISTS FOR (r:Run) REQUIRE r.runId IS UNIQUE");
  await q("1c constraint Skill", "CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.skillId IS UNIQUE");
} catch (e) {
  record("1 constraints", 0, `UNSUPPORTED: ${e.message.slice(0, 120)} — use MERGE idempotency instead`);
}

// 2. lineage shape: one teacher run -> skill -> two student runs (conditions none/skill)
//    on a shared invented task, plus a held-out task
await q("2a task abs-1", `CREATE (t:Task {taskId:"inv-01", tier:"invented", targetItem:"invented:bar"})`);
await q("2b task held-out", `CREATE (t:Task {taskId:"inv-02", tier:"invented", targetItem:"invented:fob", heldOut:true})`);
await q("2c teacher run", `CREATE (r:Run {runId:"tea-1", role:"teacher", condition:null, toolCalls:14, failedAttempts:8, durationMs:27000, exitCode:0})`);
await q("2d skill", `CREATE (s:Skill {skillId:"skl-1", classification:"procedure", exampleCount:3})`);
await q("2e GENERATED edge", `MATCH (r:Run {runId:"tea-1"}), (s:Skill {skillId:"skl-1"}) CREATE (r)-[:GENERATED]->(s)`);
await q("2f student none", `CREATE (r:Run {runId:"stu-1", role:"student", condition:"none", toolCalls:22, failedAttempts:15, durationMs:41000, exitCode:0, success:false})`);
await q("2g student skill", `CREATE (r:Run {runId:"stu-2", role:"student", condition:"skill", toolCalls:6, failedAttempts:1, durationMs:18000, exitCode:0, success:true})`);
await q("2h USED_IN edges", `MATCH (s:Skill {skillId:"skl-1"}), (r:Run {runId:"stu-2"}) CREATE (s)-[:USED_IN]->(r)`);
await q("2i ATTEMPTED edges", `MATCH (r:Run), (t:Task {taskId:"inv-01"}) WHERE r.runId STARTS WITH "stu" CREATE (r)-[:ATTEMPTED {heldOut:false}]->(t)`);
await q("2j SCORED_BY evals", `MATCH (r:Run) WHERE r.runId IN ["stu-1","stu-2"] CREATE (r)-[:SCORED_BY]->(:Eval {metric:"success", value:r.success})`);

// 3. the four judge-facing eval queries
//    (S3 finding: avg() rejects booleans — cast to float before aggregating. Carries into
//    docs/graph-schema.cypher: every avg over success goes through CASE ... THEN 1.0 ELSE 0.0.)
const lift = await q("3a skill lift", `MATCH (r:Run {role:"student"})-[:ATTEMPTED]->(t:Task) RETURN r.condition AS condition, avg(CASE WHEN r.success THEN 1.0 ELSE 0.0 END) AS success, count(*) AS n`);
record("   lift rows", 0, JSON.stringify(lift.rows));
const eff = await q("3b sample efficiency", `MATCH (s:Skill)-[:USED_IN]->(r:Run) RETURN s.exampleCount AS examples, avg(CASE WHEN r.success THEN 1.0 ELSE 0.0 END) AS success, count(*) AS n`);
record("   eff rows", 0, JSON.stringify(eff.rows));
const strat = await q("3c strategy quality", `MATCH (r:Run {role:"student"}) RETURN r.condition AS condition, avg(r.toolCalls) AS avgCalls, avg(r.failedAttempts) AS avgFailures`);
record("   strategy rows", 0, JSON.stringify(strat.rows));
const lineage = await q("3d lineage display", `MATCH path = (t:Run {role:"teacher"})-[:GENERATED]->(s:Skill)-[:USED_IN]->(r:Run)-[:ATTEMPTED]->(task:Task) RETURN [n IN nodes(path) | coalesce(n.runId, n.skillId, n.taskId)] AS chain`);
record("   lineage rows", 0, JSON.stringify(lineage.rows));

// 4. parameterized queries (open question)
try {
  const r = conn.query("MATCH (t:Task {taskId: $id}) RETURN t.targetItem AS item", { id: "inv-01" });
  record("4 params", 0, `SUPPORTED: ${JSON.stringify(r.rows)}`);
} catch (e) {
  record("4 params", 0, `check args/shape: ${e.message.slice(0, 120)}`);
}

// 5. aggregate summary
console.log("\n=== S3 summary ===");
console.log(`store: ${STORE} (directory, durable via WAL)`);
console.log(`measured query count: ${results.filter(r => Number(r.ms) > 0).length}`);
console.log(`max single-query latency: ${Math.max(...results.filter(r => r.ms > 0).map(r => Number(r.ms)))}ms`);
console.log("verdict inputs recorded above; fill s3-notes.md from this output.");
