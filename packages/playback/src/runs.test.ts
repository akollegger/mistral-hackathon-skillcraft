import { describe, expect, it } from "vitest";
import { pickRun, type RunSummary } from "./runs";

const run = (over: Partial<RunSummary>): RunSummary => ({
  runId: "r", role: "student", condition: "none", taskId: "t", tier: "traditional",
  heldOut: false, outcome: "success", modelAlias: undefined, toolCalls: 1, startedAt: null, file: undefined, ...over,
});

describe("pickRun held-out-only scenario fallback", () => {
  it("falls back to the scenario's held-out runs when no taught runs exist", () => {
    const runs = [run({ runId: "held", taskId: "trad-fence-1", heldOut: true, condition: "skill" })];
    const got = pickRun(runs, { role: "student", condition: "skill", heldOut: false, taskId: "trad-fence-1", tier: "traditional" });
    expect(got?.runId).toBe("held");
  });
  it("prefers taught runs when they exist", () => {
    const runs = [
      run({ runId: "taught", taskId: "trad-pickaxe-1", heldOut: false }),
      run({ runId: "held", taskId: "trad-pickaxe-1", heldOut: true }),
    ];
    const got = pickRun(runs, { role: "student", condition: "none", heldOut: false, taskId: "trad-pickaxe-1", tier: "traditional" });
    expect(got?.runId).toBe("taught");
  });
});
