/** Playback replayer core: parse an events.jsonl file and fold it into
 *  per-event snapshots of the mocked crafting table. Pure logic — no DOM.
 *
 *  Tolerant by design: the frozen contract (contracts/event-log.ts, tool.ts)
 *  and the harness emitter (harness/events.ts) use different payload shapes.
 *  Both are accepted:
 *    tool_call     {op, item?, slot?}            (contract)
 *                  {tool, toolName, input:{item?,slot?}, status}   (harness)
 *    tool_feedback {craftable, wouldProduce, grid, inventory}        (contract)
 *                  {tool, toolName, failed, output:{craftable, ...}} (harness)
 *    craft_result  {success, produced, feedback:{...}}               (contract)
 *                  {craftable, ..., success?, produced?}              (harness)
 *    run_start     full RunMeta                   (contract)
 *                  {runId, role, condition, taskId, modelAlias}     (harness)
 *    run_end       {outcome}                      (contract)
 *                  {exitCode, contaminated}        (harness)  */
import { z } from "zod";
import { Event } from "@skillcraft/contracts/event-log";

export type RunEvent = z.infer<typeof Event>;
export type Grid = (string | null)[][];

/** Loose run identity — a union of the contract RunMeta and the harness's
 *  reduced run_start payload (extra fields pass through). */
export const RunInfo = z
  .object({
    runId: z.string(),
    role: z.enum(["teacher", "student"]),
    condition: z.string().nullable().optional(),
    taskId: z.string(),
    tier: z.string().optional(),
    heldOut: z.boolean().optional(),
    modelAlias: z.string().optional(),
    outcome: z.string().nullable().optional(),
  })
  .passthrough();
export type RunInfoT = z.infer<typeof RunInfo>;

export class ParseError extends Error {
  constructor(
    public readonly line: number,
    cause: unknown,
  ) {
    super(`events.jsonl line ${line}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ParseError";
  }
}

/** Parse JSONL text into validated envelope events (payload stays unknown). */
export function parseEvents(text: string): RunEvent[] {
  const out: RunEvent[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw) continue;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      throw new ParseError(i + 1, e);
    }
    try {
      out.push(Event.parse(json));
    } catch (e) {
      throw new ParseError(i + 1, e);
    }
  }
  return out;
}

// ---------- Payload normalizers ----------

const CraftOp = z.enum(["place", "take", "clear", "craft"]);
export type CraftOpT = z.infer<typeof CraftOp>;
export interface ToolCallN {
  op: CraftOpT;
  item: string | undefined;
  slot: number | undefined;
}

export function toolCallOf(payload: unknown): ToolCallN | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const op = typeof o.tool === "string" ? o.tool : o.op;
  if (typeof op !== "string" || !CraftOp.safeParse(op).success) return null;
  const input =
    o.input && typeof o.input === "object" ? (o.input as Record<string, unknown>) : o;
  return {
    op: op as CraftOpT,
    item: typeof input.item === "string" ? input.item : undefined,
    slot: typeof input.slot === "number" ? input.slot : undefined,
  };
}

const FeedbackJson = z.object({
  craftable: z.boolean(),
  wouldProduce: z.string().nullable(),
  grid: z.array(z.array(z.string().nullable())).length(3),
  inventory: z.union([
    // nonnegative: a slot can hit 0 when its last item is placed on the grid
    z.record(z.string(), z.number().int().nonnegative()),
    z.array(z.tuple([z.string(), z.number().int().nonnegative()])),
  ]),
});

export interface Feedback {
  craftable: boolean;
  wouldProduce: string | null;
  grid: Grid;
  inventory: Map<string, number>;
}

/** Accepts feedback flat (contract) or nested under `output` (harness).
 *  Inventory accepts a record or [key, qty] pairs (z.map can't round-trip JSON). */
export function feedbackOf(payload: unknown): Feedback | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const raw = o.output && typeof o.output === "object" ? o.output : o;
  const parsed = FeedbackJson.safeParse(raw);
  if (!parsed.success) return null;
  const f = parsed.data;
  return {
    craftable: f.craftable,
    wouldProduce: f.wouldProduce,
    grid: f.grid as Grid,
    inventory: new Map(Array.isArray(f.inventory) ? f.inventory : Object.entries(f.inventory)),
  };
}

export interface CraftRes {
  success: boolean | null;
  produced: string | null;
  feedback: Feedback;
}

/** Contract shape {success, produced, feedback} or harness shape (flat output
 *  with optional success/produced). */
export function craftResultOf(payload: unknown): CraftRes | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (o.feedback && typeof o.feedback === "object") {
    const inner = feedbackOf(o.feedback);
    if (inner)
      return {
        success: typeof o.success === "boolean" ? o.success : null,
        produced: typeof o.produced === "string" ? o.produced : null,
        feedback: inner,
      };
  }
  const f = feedbackOf(payload);
  if (!f) return null;
  return {
    success: typeof o.success === "boolean" ? o.success : null,
    produced: typeof o.produced === "string" ? o.produced : null,
    feedback: f,
  };
}

const RunInfoLoose = RunInfo;

export function runInfoOf(payload: unknown): RunInfoT | null {
  const parsed = RunInfoLoose.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** run_end: contract {outcome} or harness {exitCode, contaminated}. */
export function outcomeOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.outcome === "string") return o.outcome;
  if (typeof o.exitCode === "number") return o.exitCode === 0 ? "success" : o.exitCode === 3 ? "timeout" : "fail";
  return null;
}

// ---------- Replay folding ----------

export interface ReplayStep {
  index: number;
  seq: number;
  kind: string;
  label: string;
  grid: Grid;
  inventory: [string, number][];
  craftable: boolean;
  wouldProduce: string | null;
  craftSuccess: boolean | null;
  /** Item produced by the most recent successful craft, null if none yet. */
  lastProduced: string | null;
  meta: RunInfoT | null;
}

const emptyGrid = (): Grid => [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

const toolCallLabel = (c: ToolCallN): string => {
  switch (c.op) {
    case "place":
      return `place ${c.item ?? "?"} @ slot ${c.slot ?? "?"}`;
    case "take":
      return `take slot ${c.slot ?? "?"}`;
    case "clear":
      return "clear grid";
    case "craft":
      return "craft!";
  }
};

const truncate = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Fold events into snapshots. Step i = state of the world after event i. */
export function buildSteps(events: RunEvent[]): ReplayStep[] {
  let grid = emptyGrid();
  let inventory = new Map<string, number>();
  let craftable = false;
  let wouldProduce: string | null = null;
  let craftSuccess: boolean | null = null;
  let lastProduced: string | null = null;
  let meta: RunInfoT | null = null;

  return events.map((ev, index) => {
    let label: string = ev.kind;
    switch (ev.kind) {
      case "run_start": {
        meta = runInfoOf(ev.payload) ?? meta;
        label = `run start · ${meta?.role ?? "?"}${meta?.condition ? ` · ${meta.condition}` : ""} · task ${meta?.taskId ?? "?"}`;
        break;
      }
      case "prompt": {
        const o = ev.payload as Record<string, unknown> | null;
        label = `prompt: ${typeof o?.text === "string" ? truncate(o.text) : `${o?.length ?? "?"} chars`}`;
        break;
      }
      case "tool_call": {
        const c = toolCallOf(ev.payload);
        label = c ? `▶ ${toolCallLabel(c)}` : "▶ tool call";
        break;
      }
      case "tool_feedback": {
        const f = feedbackOf(ev.payload);
        if (f) {
          grid = f.grid.map((r) => [...r]);
          inventory = new Map(f.inventory);
          craftable = f.craftable;
          wouldProduce = f.wouldProduce;
          label = `feedback: ${craftable ? `craftable → ${wouldProduce}` : "not craftable"}`;
        } else {
          label = "feedback";
        }
        break;
      }
      case "craft_result": {
        const c = craftResultOf(ev.payload);
        if (c) {
          grid = c.feedback.grid.map((r) => [...r]);
          inventory = new Map(c.feedback.inventory);
          craftable = c.feedback.craftable;
          wouldProduce = c.feedback.wouldProduce;
          craftSuccess = c.success;
          if (c.success) lastProduced = c.produced;
          label = c.success === true ? `✔ crafted ${c.produced}` : c.success === false ? "✘ craft failed" : "craft attempt";
        } else {
          label = "craft result";
        }
        break;
      }
      case "final_grid": {
        const g = z.array(z.array(z.string().nullable())).length(3).safeParse(ev.payload);
        if (g.success) grid = g.data as Grid;
        label = "final grid";
        break;
      }
      case "skill_loaded": {
        const o = ev.payload as Record<string, unknown> | null;
        label = `skill loaded: ${o?.name ?? o?.toolName ?? "?"}`;
        break;
      }
      case "run_end": {
        const outcome = outcomeOf(ev.payload);
        if (meta && outcome) meta = { ...meta, outcome };
        label = `run end: ${outcome ?? "?"}`;
        break;
      }
    }
    return {
      index,
      seq: ev.seq,
      kind: ev.kind,
      label,
      grid: grid.map((r) => [...r]),
      inventory: [...inventory.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      craftable,
      wouldProduce,
      craftSuccess,
      lastProduced,
      meta,
    };
  });
}

export interface Replay {
  events: RunEvent[];
  steps: ReplayStep[];
  meta: RunInfoT | null;
}

export function buildReplay(text: string): Replay {
  const events = parseEvents(text);
  const steps = buildSteps(events);
  const meta = steps.length > 0 ? steps[steps.length - 1]!.meta : null;
  return { events, steps, meta };
}
