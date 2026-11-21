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
  startedAt: string | null;
  /** demo mode: fixture file to fetch instead of an API path */
  file: string | undefined;
}

export interface RunIndex {
  runs: RunSummary[];
  manifest: unknown;
  demo: boolean;
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

/** Fetch the run index; falls back to bundled demo fixtures on any failure. */
export async function fetchRunIndex(): Promise<RunIndex> {
  try {
    const data = (await fetchJson("./api/runs")) as { runs: RunSummary[] };
    const manifest = (await fetchJson("./api/manifest").catch(() => null)) as {
      manifest: unknown;
    } | null;
    // If the dev API answers but results/ is empty, still offer demo fixtures.
    if (data.runs.length > 0) return { runs: data.runs, manifest: manifest?.manifest ?? null, demo: false };
  } catch {
    /* dev API unavailable (static build) */
  }
  demoIndex = (await fetchJson("./demo/index.json")) as DemoIndex;
  return { runs: demoIndex.runs, manifest: null, demo: true };
}

/** Raw events.jsonl text for a run. */
export async function fetchRunEvents(run: RunSummary): Promise<string> {
  if (run.file) {
    const res = await fetch(`./demo/${run.file}`);
    if (!res.ok) throw new Error(`demo fixture ${run.file}: ${res.status}`);
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
  return matches[0] ?? null;
}
