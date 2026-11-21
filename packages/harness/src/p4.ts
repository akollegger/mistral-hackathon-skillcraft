/** P4 driver — conditions grid + demo manifest (docs/demo-matrix.md).
 *
 *  Usage: node packages/harness/dist/p4.mjs [reps] [conditionsCSV]
 *  Defaults: reps=3, conditions=none,transcript,skill.
 *
 *  Students (mistral-medium-latest): every cell x condition x reps.
 *  Teacher-with-skill demo cells (mistral-large-4-0, condition=skill, student
 *  prompt shape): every cell, one per rep, pinned to the paired teacher skill.
 *  Writes results/demo-manifest.json mapping each taught scenario to its 6-pane
 *  run set. Scoring: success = a craft_result produced the scenario targetItem.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CELLS, TARGETS } from "./grid.js";
import {
	RESULTS_DIR,
	STUDENT_MODEL,
	spawnRun,
	TEACHER_MODEL,
} from "./index.js";
import type { StudentCondition } from "./prompts.js";
import { openLineageStore } from "./relate.js";
import { renderTranscript, succeeded } from "./transcript.js";

const REPS = Number(process.argv[2] ?? 3);
const CONDITIONS = (process.argv[3] ?? "none,transcript,skill").split(
	",",
) as StudentCondition[];

interface TeacherSkill {
	runId: string;
	skillId: string;
	content: string;
	taskId: string;
	tier: string;
}

function loadTeacherSkills(): TeacherSkill[] {
	const skills: TeacherSkill[] = [];
	for (const runId of readdirSync(join(RESULTS_DIR, "runs"))) {
		try {
			const meta = JSON.parse(
				readFileSync(
					join(RESULTS_DIR, "runs", runId, "skill.meta.json"),
					"utf8",
				),
			);
			const runMeta = JSON.parse(
				readFileSync(join(RESULTS_DIR, "runs", runId, "run.meta.json"), "utf8"),
			);
			if (runMeta.role === "teacher")
				skills.push({
					runId,
					skillId: meta.skillId,
					content: meta.content,
					taskId: runMeta.taskId,
					tier: runMeta.tier,
				});
		} catch {
			/* not a teacher run */
		}
	}
	return skills;
}

interface ManifestEntry {
	tier: string;
	taskId: string;
	targetItem: string;
	teacherNoneRunId: string;
	skillId: string;
	teacherSkillRunIds: string[];
	studentNoneRunIds: string[];
	studentTranscriptRunIds: string[];
	studentSkillRunIds: string[];
	studentSkillHeldOutRunIds: string[];
}

async function main() {
	const skills = loadTeacherSkills();
	console.log(
		`P4: reps=${REPS} conditions=${CONDITIONS.join("+")} cells=${CELLS.length} teacherSkills=${skills.length} (student=${STUDENT_MODEL}, teacher=${TEACHER_MODEL})`,
	);
	const store = openLineageStore(join(RESULTS_DIR, "lineage"));
	const summary: Record<string, unknown>[] = [];
	const manifest: Record<string, ManifestEntry> = {};
	let rep = 0;

	// Skill for a cell: same task if taught, else the same tier's taught skill
	// (held-out cells transfer the tier's procedure skill — docs/demo-matrix.md).
	const skillFor = (
		cell: (typeof CELLS)[number],
		r: number,
	): TeacherSkill | undefined => {
		const sameTask = skills.filter((s) => s.taskId === cell.scenario.taskId);
		const pool =
			sameTask.length > 0
				? sameTask
				: skills.filter((s) => s.tier === cell.tier);
		return pool.length > 0 ? pool[r % pool.length] : undefined;
	};

	for (const cell of CELLS) {
		store.upsertTask({
			taskId: cell.scenario.taskId,
			tier: cell.scenario.tier,
			targetItem: cell.scenario.targetItem,
			heldOut: cell.heldOut,
		});
		let entry = manifest[cell.scenario.taskId];
		if (!entry) {
			entry = {
				tier: cell.tier,
				taskId: cell.scenario.taskId,
				targetItem: cell.scenario.targetItem,
				teacherNoneRunId: "",
				skillId: "",
				teacherSkillRunIds: [],
				studentNoneRunIds: [],
				studentTranscriptRunIds: [],
				studentSkillRunIds: [],
				studentSkillHeldOutRunIds: [],
			};
			manifest[cell.scenario.taskId] = entry;
		}

		for (const condition of CONDITIONS) {
			for (let r = 0; r < REPS; r++) {
				rep++;
				const src = skillFor(cell, r);
				const transcriptContent = src
					? renderTranscript(
							join(RESULTS_DIR, "runs", src.runId, "events.jsonl"),
							{ taskId: src.taskId, outcome: "success" },
						)
					: undefined;
				const label = `${cell.tier}/${cell.label}/${condition}/rep${r}`;

				// students on every cell x condition
				console.log(`\n=== [${rep}] student ${label} ===`);
				const res = await spawnRun({
					role: "student",
					condition,
					scenario: cell.scenario,
					book: cell.book,
					timeLimitSec: 300,
					maxTurns: 30,
					...(condition === "skill" && src
						? { skillContent: src.content }
						: {}),
					...(condition === "transcript" && transcriptContent
						? { transcriptContent }
						: {}),
				});
				const success = succeeded(res.eventsPath, cell.scenario.targetItem);
				const meta = JSON.parse(readFileSync(res.metaPath, "utf8")) as Record<
					string,
					unknown
				>;
				store.upsertRun({
					runId: res.runId,
					role: "student",
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
				if (condition === "skill" && src)
					store.edge(
						{ label: "Skill", key: "skillId", value: src.skillId },
						{ label: "Run", key: "runId", value: res.runId },
						"USED_IN",
					);
				store.upsertEval({
					runId: res.runId,
					metric: "success",
					value: success ? 1 : 0,
				});
				if (!cell.heldOut && r === 0 && src) entry.teacherNoneRunId = src.runId; // pane 1 = the paired P3 teacher run
				if (condition === "none") entry.studentNoneRunIds.push(res.runId);
				if (condition === "transcript")
					entry.studentTranscriptRunIds.push(res.runId);
				if (condition === "skill")
					(cell.heldOut
						? entry.studentSkillHeldOutRunIds
						: entry.studentSkillRunIds
					).push(res.runId);
				if (condition === "skill" && src && r === 0)
					entry.skillId = src.skillId;
				summary.push({
					label,
					role: "student",
					success,
					toolCalls: meta.toolCalls,
					contaminated: res.contaminated,
				});
				console.log(
					`success=${success} toolCalls=${meta.toolCalls} contaminated=${res.contaminated}`,
				);

				// teacher-with-skill demo cell (skill condition only), same skill pinned
				if (condition === "skill" && src) {
					console.log(`\n=== [${rep}] teacher+skill ${cell.label}/rep${r} ===`);
					const tres = await spawnRun({
						role: "teacher",
						condition: "skill",
						scenario: cell.scenario,
						book: cell.book,
						timeLimitSec: 300,
						maxTurns: 30,
						maxToolCalls: 200, // teacher headroom (students stay capped at 80)
						skillContent: src.content,
					});
					const tsuccess = succeeded(tres.eventsPath, cell.scenario.targetItem);
					const tmeta = JSON.parse(
						readFileSync(tres.metaPath, "utf8"),
					) as Record<string, unknown>;
					store.upsertRun({
						runId: tres.runId,
						role: "teacher",
						condition: "skill",
						taskId: cell.scenario.taskId,
						tier: cell.tier,
						heldOut: cell.heldOut,
						outcome: tsuccess ? "success" : "fail",
						toolCalls: tmeta.toolCalls as number,
						failedAttempts: tmeta.failedAttempts as number,
						durationMs: tmeta.durationMs as number,
					});
					store.edge(
						{ label: "Run", key: "runId", value: tres.runId },
						{ label: "Task", key: "taskId", value: cell.scenario.taskId },
						"ATTEMPTED",
					);
					store.edge(
						{ label: "Skill", key: "skillId", value: src.skillId },
						{ label: "Run", key: "runId", value: tres.runId },
						"USED_IN",
					);
					store.upsertEval({
						runId: tres.runId,
						metric: "success",
						value: tsuccess ? 1 : 0,
					});
					entry.teacherSkillRunIds.push(tres.runId);
					summary.push({
						label: `${cell.label}/teacher-skill/rep${r}`,
						role: "teacher+skill",
						success: tsuccess,
						toolCalls: tmeta.toolCalls,
						contaminated: tres.contaminated,
					});
					console.log(
						`success=${tsuccess} toolCalls=${tmeta.toolCalls} contaminated=${tres.contaminated}`,
					);
				}
			}
		}
	}
	store.close();
	writeFileSync(
		join(RESULTS_DIR, "demo-manifest.json"),
		JSON.stringify({ targets: TARGETS, scenarios: manifest }, null, 2),
	);
	console.log("\n=== P4 summary ===\n" + JSON.stringify(summary, null, 2));
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
