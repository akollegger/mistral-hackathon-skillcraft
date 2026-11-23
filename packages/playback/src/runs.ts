/** Run discovery client. In dev, talks to the vite plugin API
 *  (/api/runs, /api/manifest, /api/run/<id>/events.jsonl) which scans
 *  results/runs/. In the static build (or when results/ is absent), falls
 *  back to the bundled demo fixtures in public/demo/. */

export interface RunSummary {
  runId: string;
  role: string;
  condition: string | null;
  taskId: string;
  tier: string | undefined;
  heldOut: boolean | undefined;
  outcome: string | null | undefined;
  modelAlias: string | undefined;
  toolCalls: number | undefined;
  startedAt: string | null;
  /** demo mode: fixture file to fetch instead of an API path */
  file: string | undefined;
}

export interface RunIndex {
  runs: RunSummary[];
  manifest: unknown;
  demo: boolean;
  /** where the index came from: "relate" | "jsonl" | demo fixtures */
  source: string;
  pairs: { teacherRunId: string; skillId: string; studentRunId: string }[];
}

interface DemoIndex {
  scenarios: { taskId: string; tier?: string; label?: string }[];
  runs: (RunSummary & { file: string })[];
}

let demoIndex: DemoIndex | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Fetch the run index. Source order: dev API (Relate/JSONL) → static export
 *  (./data/runs.json, gh-pages build) → bundled demo fixtures. */
export async function fetchRunIndex(): Promise<RunIndex> {
  try {
    const data = (await fetchJson("./api/runs")) as {
      runs: RunSummary[];
      source?: string;
      pairs?: RunIndex["pairs"];
    };
    // If the dev API answers but results/ is empty, keep falling through.
    if (data.runs.length > 0)
      return {
        runs: data.runs,
        manifest: null,
        demo: false,
        source: data.source ?? "jsonl",
        pairs: data.pairs ?? [],
      };
  } catch {
    /* dev API unavailable (static build) */
  }
  try {
    const data = (await fetchJson("./data/runs.json")) as {
      runs: (RunSummary & { file: string })[];
      pairs?: RunIndex["pairs"];
    };
    if (data.runs.length > 0)
      return { runs: data.runs, manifest: null, demo: false, source: "static", pairs: data.pairs ?? [] };
  } catch {
    /* no static export */
  }
  demoIndex = (await fetchJson("./demo/index.json")) as DemoIndex;
  return { runs: demoIndex.runs, manifest: null, demo: true, source: "demo", pairs: [] };
}

/** Raw events.jsonl text for a run. run.file is a base-relative static path
 *  ("data/runs/<id>.jsonl" or "demo/runs/<name>.jsonl"); otherwise the dev API. */
export async function fetchRunEvents(run: RunSummary): Promise<string> {
  if (run.file) {
    const res = await fetch(`./${run.file}`);
    if (!res.ok) throw new Error(`${run.file}: ${res.status}`);
    return res.text();
  }
  const res = await fetch(`./api/run/${encodeURIComponent(run.runId)}/events.jsonl`);
  if (!res.ok) throw new Error(`run ${run.runId}: ${res.status}`);
  return res.text();
}

/** Scenarios = distinct taskIds, richest first (most runs), then most recent. */
export function scenariosOf(runs: RunSummary[]): { taskId: string; tier: string | undefined; latest: string | null; count: number }[] {
  const byTask = new Map<string, { tier: string | undefined; latest: string | null; count: number }>();
  for (const r of runs) {
    const cur = byTask.get(r.taskId) ?? { tier: r.tier, latest: null, count: 0 };
    cur.count += 1;
    if ((r.startedAt ?? "") > (cur.latest ?? "")) cur.latest = r.startedAt;
    byTask.set(r.taskId, cur);
  }
  return [...byTask.entries()]
    .map(([taskId, v]) => ({ taskId, tier: v.tier, latest: v.latest, count: v.count }))
    .sort((a, b) => b.count - a.count || (b.latest ?? "").localeCompare(a.latest ?? ""));
}

/** Most recent run matching role + condition + heldOut within a scenario.
 *  Taught runs match by taskId; held-out runs live under a different (held-out)
 *  taskId in the same tier, so they match by tier (docs/demo-matrix.md). */
export function pickRun(
  runs: RunSummary[],
  opts: { role: string; condition: string | null; heldOut: boolean; taskId: string; tier: string | undefined },
): RunSummary | null {
  const matches = runs.filter((r) => {
    if (r.role !== opts.role || (r.condition ?? "none") !== (opts.condition ?? "none")) return false;
    if (opts.heldOut) return r.heldOut === true && (opts.tier === undefined || r.tier === opts.tier);
    return r.taskId === opts.taskId && !r.heldOut;
  });
  // A scenario may consist entirely of held-out runs (e.g. fence-heldout,
  // qux-heldout in the round-4 grid): fall back to them so the scenario
  // still has playable runs in the taught panes.
  if (matches.length === 0 && !opts.heldOut)
    return runs.find(
      (r) =>
        r.role === opts.role &&
        (r.condition ?? "none") === (opts.condition ?? "none") &&
        r.taskId === opts.taskId,
    ) ?? null;
  return matches[0] ?? null;
}
