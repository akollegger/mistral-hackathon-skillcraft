/** Playback replayer core: parse an events.jsonl file and fold it into
 *  per-event snapshots of the mocked crafting table. Pure logic — no DOM.
 *
 *  Payload narrowing lives here (playback-local) rather than in
 *  @skillcraft/contracts: the contract marks payload as `unknown` and notes
 *  per-kind zod is added when building; playback is the first builder. */
import { z } from "zod";
// Subpath imports: the package barrel re-exports `Condition` from two modules
// (pre-existing ambiguity on main), which fails tsc. Subpaths are clean.
import { Event, RunMeta } from "@skillcraft/contracts/event-log";
import { ItemId, Quantity, ToolCall } from "@skillcraft/contracts/tool";

export type RunEvent = z.infer<typeof Event>;
export type RunMetaT = z.infer<typeof RunMeta>;
export type Grid = (string | null)[][]

/** Normalized feedback: the contract's Inventory is z.map, which cannot
 *  round-trip through JSON — the harness emits a record (or entry pairs),
 *  so playback accepts both and normalizes to a Map. */
export interface Feedback {
  craftable: boolean;
  wouldProduce: string | null;
  grid: Grid;
  inventory: Map<string, number>;
}

export interface CraftRes {
  success: boolean;
  produced: string | null;
  feedback: Feedback;
}

const InventoryJson = z.union([
  z.record(ItemId, Quantity),
  z.array(z.tuple([ItemId, Quantity])),
]);

const FeedbackJson = z.object({
  craftable: z.boolean(),
  wouldProduce: ItemId.nullable(),
  grid: z.array(z.array(ItemId.nullable())).length(3),
  inventory: InventoryJson,
});

const CraftResultJson = z.object({
  success: z.boolean(),
  produced: ItemId.nullable(),
  feedback: FeedbackJson,
});

const toFeedback = (f: z.infer<typeof FeedbackJson>): Feedback => ({
  craftable: f.craftable,
  wouldProduce: f.wouldProduce,
  grid: f.grid as Grid,
  inventory: new Map(Array.isArray(f.inventory) ? f.inventory : Object.entries(f.inventory)),
});

/** Per-kind payload schemas. Loose on purpose: the harness may add fields. */
const PayloadOf = {
  run_start: RunMeta,
  prompt: z.object({ text: z.string() }).passthrough(),
  tool_call: ToolCall,
  tool_feedback: FeedbackJson,
  craft_result: CraftResultJson,
  final_grid: z.array(z.array(z.string().nullable())).length(3),
  skill_loaded: z.object({ name: z.string() }).passthrough(),
  run_end: z.object({ outcome: z.enum(["success", "fail", "timeout"]) }).passthrough(),
} as const;

export type EventKindName = keyof typeof PayloadOf;

export class ParseError extends Error {
  constructor(
    public readonly line: number,
    cause: unknown,
  ) {
    super(`events.jsonl line ${line}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ParseError";
  }
}

/** Parse JSONL text into validated events. Throws ParseError with line number. */
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

/** Narrow an event payload to its per-kind shape. Throws on mismatch.
 *  Pass the (narrowed) kind explicitly: RunEvent is a single object type with
 *  a union `kind`, so generics can't infer the literal from the event alone. */
export function payloadOf<K extends EventKindName>(kind: K, payload?: unknown): z.infer<(typeof PayloadOf)[K]> {
  return PayloadOf[kind].parse(payload) as z.infer<(typeof PayloadOf)[K]>;
}

export interface ReplayStep {
  /** Index into the steps array; -1 would be "before the run". */
  index: number;
  seq: number;
  kind: string;
  label: string;
  grid: Grid;
  inventory: [string, number][];
  craftable: boolean;
  wouldProduce: string | null;
  /** Success of the most recent craft_result, null if none yet. */
  craftSuccess: boolean | null;
  /** Item produced by the most recent successful craft, null if none yet. */
  lastProduced: string | null;
  meta: RunMetaT | null;
}

const emptyGrid = (): Grid => [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

const toolCallLabel = (c: z.infer<typeof ToolCall>): string => {
  switch (c.op) {
    case "place":
      return `place ${c.item} @ slot ${c.slot}`;
    case "take":
      return `take slot ${c.slot}`;
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
  let meta: RunMetaT | null = null;

  return events.map((ev, index) => {
    let label: string = ev.kind;
    switch (ev.kind) {
      case "run_start": {
        meta = payloadOf(ev.kind, ev.payload);
        label = `run start · ${meta.role}${meta.condition ? ` · ${meta.condition}` : ""} · ${meta.tier} · task ${meta.taskId}`;
        break;
      }
      case "prompt": {
        label = `prompt: ${truncate(payloadOf(ev.kind, ev.payload).text)}`;
        break;
      }
      case "tool_call": {
        label = `▶ ${toolCallLabel(payloadOf(ev.kind, ev.payload))}`;
        break;
      }
      case "tool_feedback": {
        const f = toFeedback(payloadOf(ev.kind, ev.payload));
        grid = f.grid.map((r) => [...r]);
        inventory = new Map(f.inventory);
        craftable = f.craftable;
        wouldProduce = f.wouldProduce;
        label = `feedback: ${craftable ? `craftable → ${wouldProduce}` : "not craftable"}`;
        break;
      }
      case "craft_result": {
        const c = payloadOf(ev.kind, ev.payload);
        const f = toFeedback(c.feedback);
        grid = f.grid.map((r) => [...r]);
        inventory = new Map(f.inventory);
        craftable = f.craftable;
        wouldProduce = f.wouldProduce;
        craftSuccess = c.success;
        if (c.success) lastProduced = c.produced;
        label = c.success ? `✔ crafted ${c.produced}` : "✘ craft failed";
        break;
      }
      case "final_grid": {
        grid = (payloadOf(ev.kind, ev.payload) as Grid).map((r) => [...r]) as Grid;
        label = "final grid";
        break;
      }
      case "skill_loaded": {
        label = `skill loaded: ${payloadOf(ev.kind, ev.payload).name}`;
        break;
      }
      case "run_end": {
        label = `run end: ${payloadOf(ev.kind, ev.payload).outcome}`;
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
  meta: RunMetaT | null;
}

export function buildReplay(text: string): Replay {
  const events = parseEvents(text);
  const steps = buildSteps(events);
  const meta = steps.length > 0 ? steps[steps.length - 1]!.meta : null;
  return { events, steps, meta };
}
