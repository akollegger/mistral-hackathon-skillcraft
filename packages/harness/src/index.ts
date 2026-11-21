/** Skillcraft run orchestrator (P2).
 *
 *  spawnRun() — one isolated vibe CLI run per call:
 *    results/runs/<runId>/
 *      prompt.md          rendered prompt (scenario + condition injection)
 *      run-spec.json      { scenario, book } consumed by the craft MCP server
 *      events.jsonl       per contracts/event-log.ts (append-only)
 *      dir/               the agent's isolated working directory
 *        work/
 *        skill.md         copied-in student input (skill condition)
 *        transcript.md    copied-in student input (transcript condition)
 *        .agents/skills/<name>/SKILL.md   auto-load install (S5 path)
 *      run.meta.json      RunMeta on completion
 *
 *  Spawn (canonical, spike S1 / docs/harness-protocol.md):
 *    vibe --prompt-file <runDir>/prompt.md --workdir <runDir>/dir \
 *      --trust --approval-policy auto-approve \
 *      --output json --output-dir <runDir> \
 *      --time-limit <T> --max-turns <N> --model <ALIAS>
 *
 *  Anti-cheat guards (post-S4/S5/S6 rulings): craft MCP is the ONLY vibe mcp
 *  registration (register before batch, remove after); run dirs carry no MCP
 *  config; ports 7474/7475 asserted closed before spawning; ambient
 *  ~/.vibe/skills moved aside during official runs and recorded in run meta;
 *  `relate serve` never runs during batches; any relate/cypher tool effect
 *  voids the run as CONTAMINATED (parseEffects).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Scenario as ScenarioS } from "@skillcraft/contracts/scenario";
import { execa } from "execa";
import type { z } from "zod";

type Scenario = z.infer<typeof ScenarioS>;

import type { Book } from "@skillcraft/world";
import {
	buildRunMeta,
	CRAFT_SERVER,
	EventLogWriter,
	parseEffects,
} from "./events.js";
import type { RunSpec } from "./mcp-server.js";
import {
	renderStudentPrompt,
	renderTeacherPrompt,
	type StudentCondition,
} from "./prompts.js";

export const RESULTS_DIR = resolve("results");
export const TEACHER_MODEL = "mistral-large-4-0";
export const STUDENT_MODEL = "mistral-medium-latest";

export interface SpawnRunRequest {
	role: "teacher" | "student";
	condition: StudentCondition | null; // students only; teacher = null
	scenario: Scenario;
	book: Book;
	timeLimitSec: number;
	maxTurns: number;
	/** student conditions: source files to copy into the run dir */
	skillContent?: string; // skill.md content (skill condition)
	transcriptContent?: string; // transcript.md content (transcript condition)
	runId?: string;
}

// --- pure helpers (unit-tested) ---

/** Serialize scenario+book for the MCP server (inventory Map -> entries). */
export function runSpecOf(scenario: Scenario, book: Book): RunSpec {
	return {
		scenario: { ...scenario, inventory: [...scenario.inventory.entries()] },
		book,
	};
}

/** S5 frontmatter gate: skill must start with --- and declare name + description. */
export function validateSkillFrontmatter(
	content: string,
): { ok: true; name: string } | { ok: false; reason: string } {
	const lines = content.split("\n");
	if (lines[0]?.trim() !== "---")
		return {
			ok: false,
			reason: "missing YAML frontmatter (first line must be ---)",
		};
	const nameMatch = content.match(/^name:\s*(.+)$/m);
	const descMatch = content.match(/^description:\s*(.+)$/m);
	if (!nameMatch || !descMatch)
		return {
			ok: false,
			reason: "frontmatter must declare name and description",
		};
	return { ok: true, name: nameMatch[1]!.trim() };
}

/** Create the run directory layout; returns paths. */
export function makeRunDir(runId: string) {
	const runDir = join(RESULTS_DIR, "runs", runId);
	mkdirSync(join(runDir, "dir", "work"), { recursive: true });
	return {
		runDir,
		dir: join(runDir, "dir"),
		promptPath: join(runDir, "prompt.md"),
		specPath: join(runDir, "run-spec.json"),
		eventsPath: join(runDir, "events.jsonl"),
		metaPath: join(runDir, "run.meta.json"),
	};
}

/** Install a skill for auto-load: <dir>/.agents/skills/<name>/SKILL.md + <dir>/skill.md reference copy. */
export function installSkill(dir: string, content: string): void {
	const gate = validateSkillFrontmatter(content);
	if (!gate.ok)
		throw new Error(`skill rejected at acceptance time: ${gate.reason}`);
	const skillDir = join(dir, ".agents", "skills", gate.name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), content);
	writeFileSync(join(dir, "skill.md"), content);
}

// --- anti-cheat guards ---

/** Run dirs must contain no vibe MCP config entries (rule 1). */
export function assertNoMcpConfigInDir(dir: string): void {
	for (const name of [".vibe", "vibe.toml", ".vibe.toml"]) {
		const p = join(dir, name);
		if (existsSync(p)) {
			const content = readFileSync(p, "utf8");
			if (/mcp/i.test(content))
				throw new Error(`anti-cheat: MCP config found in run dir ${dir}`);
		}
	}
}

/** Ports 7474/7475 must be closed before spawning experiment runs (rule 6). */
export function assertRelatePortsClosed(): Promise<void> {
	const check = (port: number) =>
		new Promise<void>((res, rej) => {
			const socket = connect(port, "127.0.0.1");
			socket.once("error", () => res()); // connect failed => nothing listening => closed
			socket.once("connect", () => {
				socket.destroy();
				rej(
					new Error(
						`anti-cheat: port ${port} is OPEN (relate serve must not run during batches)`,
					),
				);
			});
		});
	return Promise.all([check(7474), check(7475)]).then(() => undefined);
}

/** Record ambient skills + move ~/.vibe/skills aside during official runs (rule 4, S5). */
export function moveAmbientSkillsAside(): {
	asidePath: string;
	listing: string[];
} | null {
	const skillsDir = join(homedir(), ".vibe", "skills");
	if (!existsSync(skillsDir)) return null;
	const listing = readdirSync(skillsDir);
	const asidePath = join(homedir(), ".vibe", `skills.aside-${randomUUID()}`);
	renameSync(skillsDir, asidePath);
	return { asidePath, listing };
}

export function restoreAmbientSkills(asidePath: string | null): void {
	if (!asidePath) return;
	const skillsDir = join(homedir(), ".vibe", "skills");
	if (existsSync(skillsDir)) rmSync(skillsDir, { recursive: true });
	renameSync(asidePath, skillsDir);
}

// --- craft MCP registration (the ONLY allowed vibe mcp add) ---

export function registerCraftServer(
	serverEntry: string,
	env?: Record<string, string>,
): void {
	unregisterCraftServer(); // idempotent: remove any stale registration first
	const envArgs = Object.entries(env ?? {})
		.map(([k, v]) => ` --env ${k}=${v}`)
		.join("");
	execSync(
		`vibe mcp add ${CRAFT_SERVER} --transport stdio --command node --arg ${JSON.stringify(serverEntry)}${envArgs}`,
		{ stdio: "pipe" },
	);
}

export function unregisterCraftServer(): void {
	try {
		execSync(`vibe mcp remove ${CRAFT_SERVER}`, { stdio: "pipe" });
	} catch {
		/* already absent */
	}
}

// --- orchestrator ---

export interface SpawnRunResult {
	metaPath: string;
	eventsPath: string;
	runId: string;
	exitCode: number;
	contaminated: boolean;
}

/** Spawn one isolated vibe run and record everything. */
export async function spawnRun(req: SpawnRunRequest): Promise<SpawnRunResult> {
	const runId = req.runId ?? randomUUID();
	const paths = makeRunDir(runId);
	const modelAlias = req.role === "teacher" ? TEACHER_MODEL : STUDENT_MODEL;

	// run spec for the craft MCP server (one server process per vibe spawn; env inherited)
	writeFileSync(
		paths.specPath,
		JSON.stringify(runSpecOf(req.scenario, req.book)),
	);

	// prompt render + condition injection. Teacher prompt (with teaching phase)
	// only for the skill-generating run (role=teacher, condition=null). Any run
	// WITH a condition — including teacher-with-skill demo cells — gets the
	// student prompt shape plus the condition injection (docs/demo-matrix.md).
	const prompt =
		req.role === "teacher" && req.condition === null
			? renderTeacherPrompt(req.scenario)
			: renderStudentPrompt(
					req.scenario,
					req.condition ?? "none",
					req.condition === "transcript"
						? { transcriptPath: "transcript.md" }
						: req.condition === "skill"
							? { skillPath: "skill.md" }
							: {},
				);
	writeFileSync(paths.promptPath, prompt);
	if (req.condition === "skill" && req.skillContent)
		installSkill(paths.dir, req.skillContent);
	if (req.condition === "transcript" && req.transcriptContent) {
		writeFileSync(join(paths.dir, "transcript.md"), req.transcriptContent);
	}

	// anti-cheat pre-spawn asserts
	assertNoMcpConfigInDir(paths.dir);
	await assertRelatePortsClosed();
	const ambient = moveAmbientSkillsAside();
	const ambientSkills = ambient?.listing ?? null;

	const writer = new EventLogWriter(paths.eventsPath);
	writer.append("run_start", {
		runId,
		role: req.role,
		condition: req.condition,
		taskId: req.scenario.taskId,
		modelAlias,
	});
	writer.append("prompt", { length: prompt.length });

	const started = Date.now();
	let exitCode = 0;
	let stdout = "";
	let exportJson: Record<string, unknown> = {};
	// Register the craft MCP server for THIS run with the run-spec env baked in
	// (vibe does not propagate arbitrary parent env to MCP children). This is
	// the only `vibe mcp add` allowed; removed in finally.
	const serverBundle =
		process.env.SKILLCRAFT_MCP_SERVER ??
		resolve("packages/harness/dist/mcp-server.mjs");
	registerCraftServer(serverBundle, { SKILLCRAFT_RUN_SPEC: paths.specPath });
	try {
		const proc = await execa(
			"vibe",
			[
				"--prompt-file",
				paths.promptPath,
				"--workdir",
				paths.dir,
				"--trust",
				"--approval-policy",
				"auto-approve",
				"--output",
				"json",
				"--output-dir",
				paths.runDir,
				"--time-limit",
				String(req.timeLimitSec),
				"--max-turns",
				String(req.maxTurns),
				"--model",
				modelAlias,
			],
			{
				env: { ...process.env, SKILLCRAFT_RUN_SPEC: paths.specPath },
				reject: false,
			},
		);
		exitCode = proc.exitCode ?? 0;
		stdout = proc.stdout ?? "";
	} finally {
		unregisterCraftServer();
		restoreAmbientSkills(ambient?.asidePath ?? null);
	}
	const durationMs = Date.now() - started;

	// event source: --output json effect array (S2 ruling; journal is fallback only)
	let raw: unknown[] = [];
	try {
		const parsed = JSON.parse(stdout);
		raw = Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		raw = [];
	}
	const parsed = parseEffects(raw);
	for (const ev of parsed.events) writer.append(ev.kind, ev.payload, ev.ts);
	writer.append("run_end", { exitCode, contaminated: parsed.contaminated });

	try {
		exportJson = JSON.parse(
			readFileSync(join(paths.runDir, "export.json"), "utf8"),
		) as Record<string, unknown>;
	} catch {
		exportJson = {};
	}
	const outcome =
		exitCode === 0 ? "success" : exitCode === 3 ? "timeout" : "fail";
	const meta = buildRunMeta({
		runId,
		role: req.role,
		condition: req.condition ?? (req.role === "student" ? "none" : null),
		scenario: {
			taskId: req.scenario.taskId,
			tier: req.scenario.tier,
			heldOut: req.scenario.heldOut,
		},
		dir: paths.dir,
		parsed,
		durationMs,
		exportJson: exportJson as Parameters<typeof buildRunMeta>[0]["exportJson"],
		modelAlias,
		cliVersion: String(
			(exportJson as { version?: string }).version ?? "unknown",
		),
		exitCode,
		outcome,
	});
	writeFileSync(
		paths.metaPath,
		JSON.stringify(
			{ ...meta, ambientSkills, contaminated: parsed.contaminated },
			null,
			2,
		),
	);

	return {
		metaPath: paths.metaPath,
		eventsPath: paths.eventsPath,
		runId,
		exitCode,
		contaminated: parsed.contaminated,
	};
}
