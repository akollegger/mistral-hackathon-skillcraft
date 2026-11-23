/** P3 driver — teacher runs (skill generation) on every TAUGHT scenario.
 *
 *  Usage: node packages/harness/dist/p3.mjs [teachersPerScenario]
 *  Per docs/demo-matrix.md: each scenario needs a teacher run whose skill feeds
 *  the demo panes. Model = mistral-large-4-0 (TEACHER_MODEL). Harvests skill.md,
 *  frontmatter-gates it, writes skill.meta.json, records lineage in Relate.
 */

import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CELLS, TAUGHT_CELLS, cellScenario } from "./grid.js";
import { RESULTS_DIR, classifySkill, countSkillExamples, spawnRun, validateSkillFrontmatter } from "./index.js";
import { openLineageStore } from "./relate.js";

const N = Number(process.argv[2] ?? 1);
// Optional 3rd arg: only run cells whose label matches (e.g. "stool")
const ONLY = process.argv.slice(3).find((a) => !a.startsWith("--"))?.toLowerCase();
// --all: include held-out cells too (backfill teacher-cold baselines)
const ALL = process.argv.includes("--all");
const CELLS_TO_RUN = ALL ? CELLS : TAUGHT_CELLS;
/** Teachers need headroom to solve AND distill; students stay capped at 80. */
const TEACHER_MAX_TOOL_CALLS = 200;

function findSkillFile(dir: string): string | null {
	const candidates: string[] = [];
	const walk = (d: string, depth: number) => {
		if (depth > 4) return;
		for (const name of readdirSync(d)) {
			if (name === "session" || name === "node_modules") continue;
			const p = join(d, name);
			if (statSync(p).isDirectory()) walk(p, depth + 1);
			else if (name === "skill.md" || name === "SKILL.md") candidates.push(p);
		}
	};
	walk(dir, 0);
	return candidates[0] ?? null;
}

async function main() {
	console.log(
		`P3: ${N} teacher(s) per scenario x ${CELLS_TO_RUN.length} scenarios${ALL ? " (ALL incl. held-out)" : ""}`,
	);
	const store = openLineageStore(join(RESULTS_DIR, "lineage"));
	const summary: unknown[] = [];
	try {
		for (const cell of CELLS_TO_RUN) {
			if (ONLY && !cell.label.toLowerCase().includes(ONLY)) continue;
			store.upsertTask({
				taskId: cell.scenario.taskId,
				tier: cell.tier,
				targetItem: cell.scenario.targetItem,
				heldOut: false,
			});
			for (let i = 1; i <= N; i++) {
				console.log(
					`\n=== teacher ${cell.label} ${i}/${N} (task=${cell.scenario.taskId}) ===`,
				);
				const t0 = Date.now();
				const res = await spawnRun({
					role: "teacher",
					condition: null,
					scenario: cellScenario(cell),
					book: cell.book,
					timeLimitSec: 300,
					maxTurns: 25,
					maxToolCalls: TEACHER_MAX_TOOL_CALLS,
				});
				console.log(
					`exit=${res.exitCode} contaminated=${res.contaminated} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`,
				);
				const meta = JSON.parse(readFileSync(res.metaPath, "utf8")) as Record<
					string,
					unknown
				>;
				store.upsertRun({
					runId: res.runId,
					role: "teacher",
					condition: null,
					taskId: cell.scenario.taskId,
					tier: cell.tier,
					heldOut: false,
					outcome: meta.outcome as "success" | "fail" | "timeout",
					toolCalls: meta.toolCalls as number,
					failedAttempts: meta.failedAttempts as number,
					durationMs: meta.durationMs as number,
				});
				store.edge(
					{ label: "Run", key: "runId", value: res.runId },
					{ label: "Task", key: "taskId", value: cell.scenario.taskId },
					"ATTEMPTED",
				);

				// held-out cells: never harvest (a held-out skill pinned to held-out
				// students would contaminate the transfer test)
				const skillPath = cell.heldOut
					? null
					: findSkillFile(join(RESULTS_DIR, "runs", res.runId, "dir"));
				if (cell.heldOut) console.log("  held-out cell: skill NOT harvested (anti-contamination)");
				if (skillPath) {
					const content = readFileSync(skillPath, "utf8");
					const gate = validateSkillFrontmatter(content);
					if (!gate.ok) {
						console.log(`skill REJECTED: ${gate.reason}`);
					} else {
						const skillId = randomUUID();
						const skillMeta = {
							skillId,
							generatedByRunId: res.runId,
							contentHash: createHash("sha256").update(content).digest("hex"),
							content,
							classification: classifySkill(content),
							exampleCount: countSkillExamples(content),
							taskId: cell.scenario.taskId,
						};
						writeFileSync(
							join(RESULTS_DIR, "runs", res.runId, "skill.meta.json"),
							JSON.stringify(skillMeta, null, 2),
						);
						store.upsertSkill({
							skillId,
							generatedByRunId: res.runId,
							classification: "unknown",
							exampleCount: skillMeta.exampleCount,
						});
						store.edge(
							{ label: "Run", key: "runId", value: res.runId },
							{ label: "Skill", key: "skillId", value: skillId },
							"GENERATED",
						);
						console.log(
							`skill accepted: ${skillMeta.contentHash.slice(0, 12)} examples=${skillMeta.exampleCount}`,
						);
					}
				} else {
					console.log("NO skill.md found in run dir");
				}
				summary.push({
					cell: cell.label,
					runId: res.runId,
					exitCode: res.exitCode,
					toolCalls: meta.toolCalls,
					outcome: meta.outcome,
				});
			}
		}
	} finally {
		store.close();
	}
	console.log("\n=== P3 summary ===\n" + JSON.stringify(summary, null, 2));
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
