/** P6 driver — round 4: adaptive long-sample run (post-hackathon).
 *
 *  Usage: node packages/harness/dist/p6.mjs [repsPerCell] [teacherNone] [teacherSkill]
 *  Defaults: 30 student reps per interesting cell x condition (4 cells x 3
 *  conditions x 30 = up to 360 runs), 5 teacher-none (skill harvest),
 *  5 teacher+skill.
 *
 *  Goal: isolate student failures as instruction-following by running the
 *  teacher WITHOUT then WITH the skill, and give the interesting (non-saturated)
 *  cells a longer student sample. Pickaxe is excluded (saturated 3/3 at 6 calls
 *  in round 3). Student sampling is adaptive: round-robin over
 *  interestingCell x condition, early-stop a cell-condition after >=6 reps if
 *  all outcomes agree, up to repsPerCell reps each.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CELLS, TAUGHT_CELLS, type GridCell, cellScenario } from "./grid.js";
import {
	RESULTS_DIR,
	classifySkill,
	countSkillExamples,
	spawnRun,
	validateSkillFrontmatter,
} from "./index.js";
import type { StudentCondition } from "./prompts.js";
import { openLineageStore } from "./relate.js";
import { renderTranscript, succeeded } from "./transcript.js";

const REPS_PER_CELL = Number(process.argv[2] ?? 30);
const TEACHER_NONE_N = Number(process.argv[3] ?? 5);
const TEACHER_SKILL_N = Number(process.argv[4] ?? 5);
const EARLY_STOP_MIN = 6;
const CONDITIONS: StudentCondition[] = ["none", "transcript", "skill"];

/** Interesting cells = everything except the saturated pickaxe. */
const INTERESTING = CELLS.filter((c) => c.label !== "pickaxe");

interface Skill {
	runId: string;
	skillId: string;
	content: string;
	taskId: string;
	tier: string;
	classification?: "procedure" | "answer" | "unknown";
	exampleCount?: number;
}

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

function harvestSkill(runId: string, taskId: string): Skill | null {
	const dir = join(RESULTS_DIR, "runs", runId);
	const skillPath = findSkillFile(dir);
	if (!skillPath) return null;
	const content = readFileSync(skillPath, "utf8");
	const gate = validateSkillFrontmatter(content);
	if (!gate.ok) {
		console.log(`skill REJECTED: ${gate.reason}`);
		return null;
	}
	const skillId = randomUUID();
	const meta = JSON.parse(readFileSync(join(dir, "run.meta.json"), "utf8")) as Record<string, unknown>;
	writeFileSync(
		join(dir, "skill.meta.json"),
		JSON.stringify(
			{
				skillId,
				generatedByRunId: runId,
				contentHash: createHash("sha256").update(content).digest("hex"),
				content,
				classification: classifySkill(content),
				exampleCount: countSkillExamples(content),
				taskId,
			},
			null,
			2,
		),
	);
	return {
		runId,
		skillId,
		content,
		taskId,
		tier: String(meta.tier),
		classification: classifySkill(content),
		exampleCount: countSkillExamples(content),
	};
}

function skillFor(skills: Skill[], cell: GridCell, rep: number): Skill | undefined {
	const sameTask = skills.filter((s) => s.taskId === cell.scenario.taskId);
	const pool = sameTask.length > 0 ? sameTask : skills.filter((s) => s.tier === cell.tier);
	return pool.length > 0 ? pool[rep % pool.length] : undefined;
}

async function main() {
	console.log(
		`P6: repsPerCell=${REPS_PER_CELL} (up to ${INTERESTING.length * CONDITIONS.length * REPS_PER_CELL} student runs) teacherNone=${TEACHER_NONE_N} teacherSkill=${TEACHER_SKILL_N} interestingCells=${INTERESTING.map((c) => c.label).join(",")}`,
	);
	const store = openLineageStore(join(RESULTS_DIR, "lineage"));
	const summary: Record<string, unknown>[] = [];
	const record = async (
		res: { runId: string; eventsPath: string; metaPath: string; contaminated: boolean },
		role: "teacher" | "student",
		condition: StudentCondition | null,
		cell: GridCell,
		label: string,
		skillId?: string,
	) => {
		const success = succeeded(res.eventsPath, cell.scenario.targetItem);
		const meta = JSON.parse(readFileSync(res.metaPath, "utf8")) as Record<string, unknown>;
		store.upsertRun({
			runId: res.runId,
			role,
			condition,
			taskId: cell.scenario.taskId,
			tier: cell.tier,
			heldOut: cell.heldOut,
			outcome: success ? "success" : "fail",
			toolCalls: meta.toolCalls as number,
			failedAttempts: meta.failedAttempts as number,
			durationMs: meta.durationMs as number,
		});
		store.edge(
			{ label: "Run", key: "runId", value: res.runId },
			{ label: "Task", key: "taskId", value: cell.scenario.taskId },
			"ATTEMPTED",
		);
		if (skillId)
			store.edge(
				{ label: "Skill", key: "skillId", value: skillId },
				{ label: "Run", key: "runId", value: res.runId },
				"USED_IN",
			);
		store.upsertEval({ runId: res.runId, metric: "success", value: success ? 1 : 0 });
		summary.push({ label, role, success, toolCalls: meta.toolCalls, contaminated: res.contaminated });
		console.log(`  -> success=${success} toolCalls=${meta.toolCalls} contaminated=${res.contaminated}`);
	};

	// Phase 1: teacher WITHOUT skill (harvest skills), round-robin over taught cells.
	const skills: Skill[] = [];
	for (let i = 0; i < TEACHER_NONE_N; i++) {
		const cell = TAUGHT_CELLS[i % TAUGHT_CELLS.length]!;
		console.log(`\n=== teacher-none ${i + 1}/${TEACHER_NONE_N} ${cell.label} ===`);
		const res = await spawnRun({
			role: "teacher",
			condition: null,
			scenario: cellScenario(cell),
			book: cell.book,
			timeLimitSec: 300,
			maxTurns: 25,
			maxToolCalls: 200,
		});
		await record(res, "teacher", null, cell, `teacher-none/${cell.label}/${i}`);
		const tmeta = JSON.parse(readFileSync(res.metaPath, "utf8")) as Record<string, unknown>;
		const skill =
			tmeta.outcome === "success" ? harvestSkill(res.runId, cell.scenario.taskId) : null;
		if (!skill && tmeta.outcome !== "success")
			console.log(`  skill NOT harvested (teacher outcome=${tmeta.outcome})`);
		if (skill) {
			skills.push(skill);
			store.upsertSkill({ skillId: skill.skillId, generatedByRunId: res.runId, classification: skill.classification ?? "unknown", exampleCount: skill.exampleCount ?? 0 });
			store.edge(
				{ label: "Run", key: "runId", value: res.runId },
				{ label: "Skill", key: "skillId", value: skill.skillId },
				"GENERATED",
			);
			console.log(`  skill accepted: ${skill.skillId.slice(0, 8)}`);
		}
	}
	if (skills.length === 0) throw new Error("no skills harvested; cannot run skill conditions");

	// Phase 2: teacher WITH skill (student prompt shape, teacher model) on interesting cells.
	for (let i = 0; i < TEACHER_SKILL_N; i++) {
		const cell = INTERESTING[i % INTERESTING.length]!;
		const src = skillFor(skills, cell, i)!;
		console.log(`\n=== teacher+skill ${i + 1}/${TEACHER_SKILL_N} ${cell.label} ===`);
		const res = await spawnRun({
			role: "teacher",
			condition: "skill",
			scenario: cellScenario(cell),
			book: cell.book,
			timeLimitSec: 300,
			maxTurns: 30,
			maxToolCalls: 200,
			skillContent: src.content,
		});
		await record(res, "teacher", "skill", cell, `teacher+skill/${cell.label}/${i}`, src.skillId);
	}

	// Phase 3: adaptive student sample over interesting cells x conditions.
	const done = new Map<string, { ok: number; n: number }>();
	let spent = 0;
	let rep = 0;
	let rounds = 0;
	while (rounds < REPS_PER_CELL) {
		rounds++;
		let ranAny = false;
		for (const cell of INTERESTING) {
			for (const condition of CONDITIONS) {
				const key = `${cell.label}/${condition}`;
				const d = done.get(key) ?? { ok: 0, n: 0 };
				if (d.n >= REPS_PER_CELL) continue;
				if (d.n >= EARLY_STOP_MIN && (d.ok === d.n || d.ok === 0)) {
					if (d.n === EARLY_STOP_MIN) console.log(`-- early stop ${key} at ${d.ok}/${d.n} (saturated/hopeless)`);
					done.set(key, { ...d, n: REPS_PER_CELL });
					continue;
				}
				const src = skillFor(skills, cell, rep);
				const transcriptContent = src
					? renderTranscript(join(RESULTS_DIR, "runs", src.runId, "events.jsonl"), {
							taskId: src.taskId,
							outcome: (JSON.parse(readFileSync(join(RESULTS_DIR, "runs", src.runId, "run.meta.json"), "utf8")) as Record<string, unknown>).outcome as string,
						})
					: undefined;
				console.log(`\n=== student ${key}/rep${d.n} (${spent + 1} total) ===`);
				const res = await spawnRun({
					role: "student",
					condition,
					scenario: cellScenario(cell),
					book: cell.book,
					timeLimitSec: 300,
					maxTurns: 30,
					...(condition === "skill" && src ? { skillContent: src.content, skillId: src.skillId } : {}),
					...(condition === "transcript" && transcriptContent ? { transcriptContent } : {}),
				});
				const success = succeeded(res.eventsPath, cell.scenario.targetItem);
				await record(res, "student", condition, cell, `student/${key}/rep${d.n}`, condition === "skill" ? src?.skillId : undefined);
				done.set(key, { ok: d.ok + (success ? 1 : 0), n: d.n + 1 });
				spent++;
				ranAny = true;
				rep++;
			}
		}
		if (!ranAny) break;
	}
	store.close();
	console.log("\n=== P6 summary ===\n" + JSON.stringify(summary, null, 2));
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
