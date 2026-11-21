/** P5 analysis — judge-ready tables from results/ (events.jsonl + run.meta.json
 *  are the source of truth; the Relate graph is the queryable mirror).
 *
 *  Outputs, one table each:
 *    skillLift()        success with skill vs none, per tier, taught vs held-out
 *    sampleEfficiency() student success bucketed by skill.exampleCount
 *    strategyQuality()  avg toolCalls + failedAttempts per tier x condition
 *    skillQuality()     student outcome vs teacher skill classification
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RunMeta } from "@skillcraft/contracts/event-log";
import type { z } from "zod";

export interface RunRecord {
	meta: z.infer<typeof RunMeta>;
	skillClassification?: string;
	skillExampleCount?: number;
	success: boolean;
}

const TIER_ORDER = ["traditional", "derived", "invented"] as const;

/** Success = a craft_result event produced the task's target item. */
function scoredSuccess(
	runsDir: string,
	runId: string,
	target: string | undefined,
): boolean {
	if (!target) return false;
	const eventsPath = join(runsDir, runId, "events.jsonl");
	if (!existsSync(eventsPath)) return false;
	return readFileSync(eventsPath, "utf8")
		.trim()
		.split("\n")
		.some((l) => {
			try {
				const ev = JSON.parse(l) as {
					kind: string;
					payload?: { produced?: string | null };
				};
				return ev.kind === "craft_result" && ev.payload?.produced === target;
			} catch {
				return false;
			}
		});
}

/** Load all runs. targets maps taskId -> targetItem (from the scenario books). */
export function loadRuns(
	resultsDir: string,
	targets: Record<string, string>,
): RunRecord[] {
	const runsDir = join(resultsDir, "runs");
	if (!existsSync(runsDir)) return [];
	const out: RunRecord[] = [];
	for (const runId of readdirSync(runsDir)) {
		try {
			const meta = RunMeta.parse(
				JSON.parse(readFileSync(join(runsDir, runId, "run.meta.json"), "utf8")),
			);
			const skillMetaPath = join(runsDir, runId, "skill.meta.json");
			let skillClassification: string | undefined;
			let skillExampleCount: number | undefined;
			if (existsSync(skillMetaPath)) {
				const sm = JSON.parse(readFileSync(skillMetaPath, "utf8")) as {
					classification?: string;
					exampleCount?: number;
				};
				skillClassification = sm.classification;
				skillExampleCount = sm.exampleCount;
			}
			out.push({
				meta,
				...(skillClassification !== undefined ? { skillClassification } : {}),
				...(skillExampleCount !== undefined ? { skillExampleCount } : {}),
				success: scoredSuccess(runsDir, runId, targets[meta.taskId]),
			});
		} catch {
			/* skip malformed run dirs */
		}
	}
	return out;
}

const students = (runs: RunRecord[]) =>
	runs.filter((r) => r.meta.role === "student");
const rate = (rs: RunRecord[]) =>
	rs.length === 0 ? null : rs.filter((r) => r.success).length / rs.length;

/** skillLift: success rate with skill vs none vs transcript, per tier, taught vs held-out. */
export function skillLift(runs: RunRecord[]): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (const tier of TIER_ORDER) {
		for (const heldOut of [false, true]) {
			const cell = students(runs).filter(
				(r) => r.meta.tier === tier && r.meta.heldOut === heldOut,
			);
			if (cell.length === 0) continue;
			const none = rate(cell.filter((r) => r.meta.condition === "none"));
			const transcript = rate(
				cell.filter((r) => r.meta.condition === "transcript"),
			);
			const skill = rate(cell.filter((r) => r.meta.condition === "skill"));
			rows.push({
				tier,
				heldOut,
				n: cell.length,
				none,
				transcript,
				skill,
				lift: skill !== null && none !== null ? skill - none : null,
			});
		}
	}
	return rows;
}

/** sampleEfficiency: student (skill condition) success bucketed by examples in the used skill. */
export function sampleEfficiency(runs: RunRecord[]): Record<string, unknown>[] {
	const byExamples = new Map<number, RunRecord[]>();
	for (const r of students(runs)) {
		if (r.meta.condition === "skill" && r.skillExampleCount !== undefined) {
			const arr = byExamples.get(r.skillExampleCount) ?? [];
			arr.push(r);
			byExamples.set(r.skillExampleCount, arr);
		}
	}
	return [...byExamples.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([examples, rs]) => ({
			examples,
			n: rs.length,
			successRate: rate(rs),
		}));
}

/** strategyQuality: avg toolCalls + failedAttempts per tier x condition. */
export function strategyQuality(runs: RunRecord[]): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (const tier of TIER_ORDER) {
		for (const condition of ["none", "transcript", "skill"]) {
			const cell = students(runs).filter(
				(r) => r.meta.tier === tier && r.meta.condition === condition,
			);
			if (cell.length === 0) continue;
			rows.push({
				tier,
				condition,
				n: cell.length,
				avgToolCalls:
					cell.reduce((a, r) => a + r.meta.toolCalls, 0) / cell.length,
				avgFailedAttempts:
					cell.reduce((a, r) => a + r.meta.failedAttempts, 0) / cell.length,
				successRate: rate(cell),
			});
		}
	}
	return rows;
}

/** skillQuality: student outcome vs teacher skill classification. */
export function skillQuality(runs: RunRecord[]): Record<string, unknown>[] {
	const byClass = new Map<string, RunRecord[]>();
	for (const r of students(runs)) {
		if (r.meta.condition === "skill" && r.skillClassification) {
			const arr = byClass.get(r.skillClassification) ?? [];
			arr.push(r);
			byClass.set(r.skillClassification, arr);
		}
	}
	return [...byClass.entries()].map(([classification, rs]) => ({
		skillClassification: classification,
		n: rs.length,
		successRate: rate(rs),
		avgToolCalls: rs.reduce((a, r) => a + r.meta.toolCalls, 0) / rs.length,
	}));
}
