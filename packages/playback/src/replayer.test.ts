import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReplay, buildSteps, outcomeOf, parseEvents, ParseError, toolCallOf } from "./replayer";

// Legacy contract-shaped sample: {op, item, slot}, flat feedback, nested craft feedback, full RunMeta.
const meta = {
  runId: "11111111-2222-4333-8444-555555555555",
  role: "student",
  condition: "skill",
  taskId: "item:fiz",
  tier: "invented",
  heldOut: true,
  dir: "/tmp/run-1",
  outcome: null,
  durationMs: 0,
  toolCalls: 0,
  failedAttempts: 0,
  sessionId: null,
  steps: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  modelAlias: "test",
  cliVersion: "0.0.0",
  exitCode: 0,
};

const ev = (seq: number, kind: string, payload: unknown) =>
  JSON.stringify({ ts: `2026-10-31T12:00:${String(seq).padStart(2, "0")}.000Z`, seq, kind, payload });

const gridWith = (entries: [number, string][]): (string | null)[][] => {
  const g: (string | null)[][] = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
  for (const [slot, item] of entries) g[(slot / 3) | 0]![slot % 3] = item;
  return g;
};

const feedback = (entries: [number, string][], craftable: boolean, wouldProduce: string | null, inv: Record<string, number>) => ({
  craftable,
  wouldProduce,
  grid: gridWith(entries),
  inventory: inv,
});

const sample = [
  ev(1, "run_start", meta),
  ev(2, "prompt", { text: "craft the fiz" }),
  ev(3, "tool_call", { op: "place", item: "item:planks", slot: 0 }),
  ev(4, "tool_feedback", feedback([[0, "item:planks"]], false, null, { "item:planks": 2 })),
  ev(5, "tool_call", { op: "place", item: "item:planks", slot: 1 }),
  ev(6, "tool_feedback", feedback([[0, "item:planks"], [1, "item:planks"]], true, "item:fiz", { "item:planks": 1 })),
  ev(7, "tool_call", { op: "craft" }),
  ev(8, "craft_result", { success: true, produced: "item:fiz", feedback: feedback([], false, null, { "item:fiz": 1 }) }),
  ev(9, "run_end", { outcome: "success" }),
].join("\n");

// Harness-emitted shapes (packages/harness/src/events.ts): tool/input, output-nested feedback.
const harnessSample = [
  ev(1, "run_start", { runId: "abc", role: "student", condition: "skill", taskId: "inv-bar-1", modelAlias: "mistral-medium-latest" }),
  ev(2, "prompt", { length: 400 }),
  ev(3, "skill_loaded", { toolName: "mcp_skillcraft_skills.bar-recipe", status: "ok" }),
  ev(4, "tool_call", { tool: "place", toolName: "mcp_skillcraft.place", input: { item: "item:goo", slot: 0 }, status: "ok" }),
  ev(5, "tool_feedback", { tool: "place", toolName: "mcp_skillcraft.place", failed: false, output: feedback([[0, "item:goo"]], false, null, { "item:goo": 1 }) }),
  ev(6, "tool_call", { tool: "craft", toolName: "mcp_skillcraft.craft", input: {}, status: "ok" }),
  ev(7, "craft_result", { craftable: false, wouldProduce: null, grid: gridWith([]), inventory: { "inv-bar-1": 1 }, success: true, produced: "inv-bar-1" }),
  ev(8, "run_end", { exitCode: 0, contaminated: false }),
].join("\n");

describe("parseEvents", () => {
  it("parses valid JSONL and skips blank lines", () => {
    const events = parseEvents(`\n${sample}\n\n`);
    expect(events).toHaveLength(9);
    expect(events[0]!.kind).toBe("run_start");
  });

  it("throws ParseError with the line number on bad JSON", () => {
    expect(() => parseEvents(`${sample}\n{not json`)).toThrow(ParseError);
    try {
      parseEvents(`${sample}\n{not json`);
    } catch (e) {
      expect((e as ParseError).line).toBe(10);
    }
  });

  it("rejects events with unknown kinds", () => {
    expect(() => parseEvents(ev(1, "explode", {}))).toThrow(ParseError);
  });
});

describe("normalizers accept both contract and harness shapes", () => {
  it("toolCallOf: op-shape and tool/input-shape", () => {
    expect(toolCallOf({ op: "place", item: "item:planks", slot: 3 })).toEqual({ op: "place", item: "item:planks", slot: 3 });
    expect(toolCallOf({ tool: "place", toolName: "mcp_skillcraft.place", input: { item: "item:goo", slot: 0 }, status: "ok" })).toEqual({ op: "place", item: "item:goo", slot: 0 });
    expect(toolCallOf({ tool: "craft", input: {} })).toEqual({ op: "craft", item: undefined, slot: undefined });
    expect(toolCallOf({ toolName: "mcp_other.file_read" })).toBeNull();
  });

  it("outcomeOf: outcome string and exitCode mapping", () => {
    expect(outcomeOf({ outcome: "success" })).toBe("success");
    expect(outcomeOf({ exitCode: 0, contaminated: false })).toBe("success");
    expect(outcomeOf({ exitCode: 3 })).toBe("timeout");
    expect(outcomeOf({ exitCode: 1 })).toBe("fail");
  });
});

describe("buildSteps (contract shape)", () => {
  const steps = buildSteps(parseEvents(sample));

  it("produces one snapshot per event", () => {
    expect(steps).toHaveLength(9);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("folds tool_feedback into grid and inventory state", () => {
    expect(steps[3]!.grid[0]![0]).toBe("item:planks");
    expect(steps[3]!.inventory).toEqual([["item:planks", 2]]);
    expect(steps[3]!.craftable).toBe(false);
  });

  it("tracks craftability, wouldProduce, craft success, lastProduced", () => {
    expect(steps[5]!.craftable).toBe(true);
    expect(steps[5]!.wouldProduce).toBe("item:fiz");
    expect(steps[7]!.craftSuccess).toBe(true);
    expect(steps[7]!.lastProduced).toBe("item:fiz");
    expect(steps[7]!.grid.flat().every((c) => c === null)).toBe(true);
    expect(steps[7]!.label).toContain("item:fiz");
  });

  it("carries run meta through and labels the run end", () => {
    expect(steps[8]!.meta?.role).toBe("student");
    expect(steps[8]!.label).toBe("run end: success");
  });

  it("labels tool calls readably", () => {
    expect(steps[2]!.label).toBe("▶ place item:planks @ slot 0");
    expect(steps[6]!.label).toBe("▶ craft!");
  });
});

describe("buildSteps (harness shape)", () => {
  const steps = buildSteps(parseEvents(harnessSample));

  it("reads tool/input calls and output-nested feedback", () => {
    expect(steps[3]!.label).toBe("▶ place item:goo @ slot 0");
    expect(steps[4]!.grid[0]![0]).toBe("item:goo");
    expect(steps[4]!.inventory).toEqual([["item:goo", 1]]);
  });

  it("reads flat craft_result with success/produced", () => {
    expect(steps[6]!.craftSuccess).toBe(true);
    expect(steps[6]!.lastProduced).toBe("inv-bar-1");
    expect(steps[6]!.label).toBe("✔ crafted inv-bar-1");
  });

  it("accepts zero-quantity inventory entries (item exhausted by placing)", () => {
    // Regression: a feedback whose inventory hits 0 (e.g. both sticks placed)
    // must still fold the grid — positive() rejected 0 and froze the board.
    const text = [
      ev(0, "run_start", { runId: "r", role: "student", condition: "skill", taskId: "trad-pickaxe-1" }),
      ev(1, "tool_call", { tool: "place", toolName: "mcp_skillcraft.place", input: { item: "item:stick", slot: 7 }, status: "completed" }),
      ev(2, "tool_feedback", { tool: "place", toolName: "mcp_skillcraft.place", failed: false, output: { craftable: true, wouldProduce: "item:wooden_pickaxe", grid: [["item:oak_planks", "item:oak_planks", "item:oak_planks"], [null, "item:stick", null], [null, "item:stick", null]], inventory: { "item:oak_planks": 2, "item:stick": 0 } } }),
    ].join("\n");
    const s = buildSteps(parseEvents(text));
    expect(s[2]!.grid[2]![1]).toBe("item:stick");
    expect(s[2]!.craftable).toBe(true);
    expect(s[2]!.wouldProduce).toBe("item:wooden_pickaxe");
    expect(s[2]!.inventory).toEqual([["item:oak_planks", 2], ["item:stick", 0]]);
  });

  it("maps exitCode to outcome and labels skill_loaded", () => {
    expect(steps[7]!.label).toBe("run end: success");
    expect(steps[2]!.label).toContain("bar-recipe");
    expect(steps[1]!.label).toBe("prompt: 400 chars");
  });
});

describe("buildReplay", () => {
  it("exposes meta from the run", () => {
    const r = buildReplay(sample);
    expect(r.meta?.taskId).toBe("item:fiz");
    expect(r.steps).toHaveLength(9);
  });
});

describe("demo fixtures in public/demo/runs (harness shape)", () => {
  const demo = (name: string) => readFileSync(`public/demo/runs/${name}.jsonl`, "utf8");

  it("matrix run 1: teacher none taught ends in a successful craft", () => {
    const r = buildReplay(demo("teacher-none-taught"));
    expect(r.meta?.role).toBe("teacher");
    expect(r.meta?.condition ?? null).toBeNull(); // teacher: condition null in start payload
    const crafts = r.steps.filter((s) => s.kind === "craft_result");
    expect(crafts.map((s) => s.craftSuccess)).toEqual([false, true]);
    expect(r.steps[r.steps.length - 1]!.label).toBe("run end: success");
  });

  it("matrix run 4: student none taught fails", () => {
    const r = buildReplay(demo("student-none-taught"));
    expect(r.meta?.role).toBe("student");
    expect(r.meta?.condition).toBe("none");
    expect(r.steps[r.steps.length - 1]!.label).toBe("run end: fail");
    expect(r.steps.some((s) => s.craftSuccess === false)).toBe(true);
  });

  it("matrix runs 5/6: student with skill succeeds, incl. held-out", () => {
    const taught = buildReplay(demo("student-skill-taught"));
    expect(taught.meta?.condition).toBe("skill");
    expect(taught.meta?.heldOut).toBe(false);
    expect(taught.steps[taught.steps.length - 1]!.label).toBe("run end: success");
    const heldOut = buildReplay(demo("student-skill-heldout"));
    expect(heldOut.meta?.heldOut).toBe(true);
    expect(heldOut.meta?.taskId).toBe("inv-qux-heldout");
    expect(heldOut.steps.some((s) => s.lastProduced === "item:qux")).toBe(true);
  });
});
