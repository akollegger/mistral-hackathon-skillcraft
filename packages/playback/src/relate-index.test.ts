/** Tests readRelateIndex against a real embedded Relate DB shaped like the
 *  harness writes it (Run nodes + GENERATED/USED_IN edges). Node env. */
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "@relate/relate";
import { afterEach, describe, expect, it } from "vitest";
import { readRelateIndex } from "./relate-index";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function makeResultsDir(): string {
  dir = mkdtempSync(join(tmpdir(), "playback-relate-"));
  mkdirSync(join(dir, "lineage"), { recursive: true });
  return dir;
}

function seed(dbPath: string): void {
  const db = Database.open(dbPath);
  const conn = db.connect();
  const run = (runId: string, props: Record<string, unknown>) =>
    conn.query(
      `MERGE (r:Run {runId: $runId}) SET r.role = $role, r.condition = $condition, r.taskId = $taskId,
       r.tier = $tier, r.heldOut = $heldOut, r.outcome = $outcome, r.toolCalls = $toolCalls,
       r.failedAttempts = 0, r.durationMs = 1000`,
      { runId, ...props } as never,
    );
  run("t1", { role: "teacher", condition: null, taskId: "invented:bar", tier: "invented", heldOut: false, outcome: "success", toolCalls: 6 });
  run("s1", { role: "student", condition: "skill", taskId: "invented:bar", tier: "invented", heldOut: false, outcome: "success", toolCalls: 3 });
  run("s2", { role: "student", condition: "none", taskId: "invented:bar", tier: "invented", heldOut: false, outcome: "fail", toolCalls: 6 });
  conn.query("CREATE (s:Skill {skillId: 'sk1'})");
  conn.query("MATCH (a:Run {runId:'t1'}), (b:Skill {skillId:'sk1'}), (c:Run {runId:'s1'}) CREATE (a)-[:GENERATED]->(b)-[:USED_IN]->(c)");
  db.checkpoint();
}

describe("readRelateIndex", () => {
  it("returns null when no lineage DB exists", () => {
    const d = makeResultsDir();
    rmSync(join(d, "lineage"), { recursive: true, force: true });
    expect(readRelateIndex(d)).toBeNull();
  });

  it("reads Run nodes and teacher→skill→student pairs", () => {
    const d = makeResultsDir();
    seed(join(d, "lineage"));
    // run dirs for startedAt (mtime)
    for (const id of ["t1", "s1", "s2"]) mkdirSync(join(d, "runs", id), { recursive: true });

    const idx = readRelateIndex(d);
    expect(idx).not.toBeNull();
    expect(idx!.runs).toHaveLength(3);
    const s1 = idx!.runs.find((r) => r.runId === "s1")!;
    expect(s1.role).toBe("student");
    expect(s1.condition).toBe("skill");
    expect(s1.taskId).toBe("invented:bar");
    expect(s1.tier).toBe("invented");
    expect(s1.heldOut).toBe(false);
    expect(s1.outcome).toBe("success");
    expect(s1.toolCalls).toBe(3);
    expect(s1.startedAt).not.toBeNull();
    expect(idx!.pairs).toEqual([{ teacherRunId: "t1", skillId: "sk1", studentRunId: "s1" }]);
  });
});
