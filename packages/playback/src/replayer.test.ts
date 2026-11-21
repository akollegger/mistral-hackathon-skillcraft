import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildReplay, buildSteps, parseEvents, ParseError } from "./replayer";

const meta = {
  runId: "11111111-2222-4333-8444-555555555555",
  role: "student",
  condition: "skill",
  taskId: "invented:fiz",
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
  ev(3, "tool_call", { op: "place", item: "minecraft:planks", slot: 0 }),
  ev(4, "tool_feedback", feedback([[0, "minecraft:planks"]], false, null, { "minecraft:planks": 2 })),
  ev(5, "tool_call", { op: "place", item: "minecraft:planks", slot: 1 }),
  ev(6, "tool_feedback", feedback([[0, "minecraft:planks"], [1, "minecraft:planks"]], true, "invented:fiz", { "minecraft:planks": 1 })),
  ev(7, "tool_call", { op: "craft" }),
  ev(8, "craft_result", { success: true, produced: "invented:fiz", feedback: feedback([], false, null, { "invented:fiz": 1 }) }),
  ev(9, "run_end", { outcome: "success" }),
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

describe("buildSteps", () => {
  const steps = buildSteps(parseEvents(sample));

  it("produces one snapshot per event", () => {
    expect(steps).toHaveLength(9);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("folds tool_feedback into grid and inventory state", () => {
    expect(steps[3]!.grid[0]![0]).toBe("minecraft:planks");
    expect(steps[3]!.inventory).toEqual([["minecraft:planks", 2]]);
    expect(steps[3]!.craftable).toBe(false);
  });

  it("tracks craftability and wouldProduce", () => {
    expect(steps[5]!.craftable).toBe(true);
    expect(steps[5]!.wouldProduce).toBe("invented:fiz");
  });

  it("records craft success and final state", () => {
    expect(steps[7]!.craftSuccess).toBe(true);
    expect(steps[7]!.grid.flat().every((c) => c === null)).toBe(true);
    expect(steps[7]!.inventory).toEqual([["invented:fiz", 1]]);
    expect(steps[7]!.label).toContain("invented:fiz");
  });

  it("carries run meta through and labels the run end", () => {
    expect(steps[8]!.meta?.role).toBe("student");
    expect(steps[8]!.label).toBe("run end: success");
  });

  it("labels tool calls readably", () => {
    expect(steps[2]!.label).toBe("▶ place minecraft:planks @ slot 0");
    expect(steps[6]!.label).toBe("▶ craft!");
  });
});

describe("buildReplay", () => {
  it("exposes meta from the run", () => {
    const r = buildReplay(sample);
    expect(r.meta?.taskId).toBe("invented:fiz");
    expect(r.steps).toHaveLength(9);
  });
});

describe("demo fixtures in public/demo", () => {
  const demo = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../public/demo/${name}`, import.meta.url)), "utf8");

  it("teacher demo parses and ends in a successful craft", () => {
    const r = buildReplay(demo("teacher.events.jsonl"));
    expect(r.meta?.role).toBe("teacher");
    const last = r.steps[r.steps.length - 1]!;
    expect(last.kind).toBe("run_end");
    expect(last.label).toBe("run end: success");
    const craft = r.steps.find((s) => s.kind === "craft_result")!;
    expect(craft.craftSuccess).toBe(true);
    expect(craft.wouldProduce ?? r.steps[craft.index - 1]!.wouldProduce).toBe("minecraft:wooden_pickaxe");
  });

  it("student demo parses, shows a failed attempt then success", () => {
    const r = buildReplay(demo("student.events.jsonl"));
    expect(r.meta?.condition).toBe("skill");
    expect(r.meta?.heldOut).toBe(true);
    const crafts = r.steps.filter((s) => s.kind === "craft_result");
    expect(crafts.map((s) => s.craftSuccess)).toEqual([false, true]);
  });
});
