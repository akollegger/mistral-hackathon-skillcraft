import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { readRelateIndex } from "./src/relate-index";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
/** Run output dir; override with SKILLCRAFT_RESULTS_DIR. results/ is gitignored. */
const resultsDir = process.env.SKILLCRAFT_RESULTS_DIR ?? resolve(pkgDir, "../../results");

export interface RunSummary {
  runId: string;
  dir: string;
  role: string;
  condition: string | null;
  taskId: string;
  tier: string | undefined;
  heldOut: boolean | undefined;
  outcome: string | null | undefined;
  modelAlias: string | undefined;
  toolCalls: number | undefined;
  startedAt: string | null;
}

/** Scan results/runs/<runId>/ for run.meta.json (preferred) or the first
 *  events.jsonl line (fallback) to build the run index. */
function scanRuns(): RunSummary[] {
  const runsDir = join(resultsDir, "runs");
  if (!existsSync(runsDir)) return [];
  const out: RunSummary[] = [];
  for (const runId of readdirSync(runsDir)) {
    const dir = join(runsDir, runId);
    if (!statSync(dir).isDirectory()) continue;
    let meta: Record<string, unknown> | null = null;
    try {
      meta = JSON.parse(readFileSync(join(dir, "run.meta.json"), "utf8"));
    } catch {
      /* run not completed yet — fall back to events.jsonl */
    }
    let startedAt: string | null = null;
    let toolCalls: number | undefined;
    if (!meta) {
      try {
        const lines = readFileSync(join(dir, "events.jsonl"), "utf8").split("\n");
        const first = lines[0];
        if (first) {
          const ev = JSON.parse(first) as { ts?: string; payload?: Record<string, unknown> };
          startedAt = ev.ts ?? null;
          meta = (ev.payload ?? {}) as Record<string, unknown>;
        }
        toolCalls = lines.filter((l) => l.includes('"tool_call"')).length;
      } catch {
        /* no events yet */
      }
    }
    if (!meta) continue;
    out.push({
      runId,
      dir,
      role: String(meta.role ?? "?"),
      condition: (meta.condition as string | null) ?? null,
      taskId: String(meta.taskId ?? "?"),
      tier: meta.tier as string | undefined,
      heldOut: meta.heldOut as boolean | undefined,
      outcome: (meta.outcome as string | null) ?? null,
      modelAlias: meta.modelAlias as string | undefined,
      toolCalls: (meta.toolCalls as number | undefined) ?? toolCalls,
      startedAt,
    });
  }
  // most recent first
  out.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  return out;
}

function readManifest(): unknown {
  try {
    return JSON.parse(readFileSync(join(resultsDir, "demo-manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function sendJson(res: import("node:http").ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

/** Dev-only API: /api/runs, /api/manifest, /api/run/<runId>/events.jsonl */
function runsApi(): Plugin {
  return {
    name: "skillcraft-runs-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0]!;
        if (!url.startsWith("/api/")) return next();
        if (url === "/api/runs") {
          // Relate lineage DB first (authoritative metadata + pairing edges),
          // JSONL/meta scan as fallback, empty list when neither exists.
          const relate = readRelateIndex(resultsDir);
          if (relate) return sendJson(res, { resultsDir, source: "relate", runs: relate.runs, pairs: relate.pairs });
          return sendJson(res, { resultsDir, source: "jsonl", runs: scanRuns(), pairs: [] });
        }
        if (url === "/api/manifest") return sendJson(res, { manifest: readManifest() });
        const m = /^\/api\/run\/([^/]+)\/events\.jsonl$/.exec(url);
        if (m) {
          const file = join(resultsDir, "runs", m[1]!, "events.jsonl");
          if (!existsSync(file)) return sendJson(res, { error: "not found" }, 404);
          res.writeHead(200, { "content-type": "application/x-ndjson" });
          res.end(readFileSync(file, "utf8"));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Relative base so the built app works from any static path (demo hosting).
  base: "./",
  plugins: [runsApi()],
});
