/** Event log (contracts/event-log.ts) + vibe --output json effect parser.
 *
 *  Parser rulings (locked, docs/harness-protocol.md post-S6):
 *  - Craft tool effects carry NAMESPACED toolNames: mcp_<server>_<tool>.
 *    Parse by suffix match on the registered server name, never equality
 *    with the bare tool name.
 *  - Metrics (toolCalls, failedAttempts) count individual tool EFFECTS,
 *    not agent turns (one turn may batch several MCP calls).
 *  - Contamination: any effect whose toolName mentions relate/cypher voids
 *    the run as CONTAMINATED (kept for analysis, excluded from results).
 *
 *  Effect shape (vibe 3.1.4 --output json, confirmed in s6-raw.log):
 *    entry.type === "effect",
 *    entry.detail.kind === "tool" | "skill" | ...,
 *    entry.detail.toolName, entry.detail.input,
 *    entry.state.status: "completed" | "failed",
 *    entry.state.outputText: JSON string of the tool result payload.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
	EventKind,
	Event as EventS,
	RunMeta as RunMetaS,
} from "@skillcraft/contracts/event-log";
import type { z } from "zod";

type Event = z.infer<typeof EventS>;
type RunMeta = z.infer<typeof RunMetaS>;

export const CRAFT_SERVER = "skillcraft";
const CRAFT_OPS = ["place", "take", "clear", "craft"] as const;
export type CraftOp = (typeof CRAFT_OPS)[number];

/** Raw effect entry as emitted by `vibe --output json`. */
export interface RawEffect {
	type?: string;
	detail?: { kind?: string; toolName?: string; input?: unknown };
	state?: { status?: string; outputText?: string };
}

export interface ParsedRun {
	events: Event[];
	toolCalls: number;
	failedAttempts: number;
	contaminated: boolean;
	finalFeedback: unknown;
}

/** Namespaced toolName (confirmed live, vibe 3.1.4): `mcp_<server>.<tool>` with server
 *  non-alphanumerics normalized to "_" (S6 server "skillcraft-s6" -> mcp_skillcraft_s6.place).
 *  Prefix-match on the registered server name, never equality with the bare tool name. */
export function craftOpOf(
	toolName: string,
	server: string = CRAFT_SERVER,
): CraftOp | null {
	const normalized = server.replace(/[^a-zA-Z0-9]/g, "_");
	const prefix = `mcp_${normalized}.`;
	if (!toolName.startsWith(prefix)) return null;
	const op = toolName.slice(prefix.length);
	return (CRAFT_OPS as readonly string[]).includes(op) ? (op as CraftOp) : null;
}

function isContamination(toolName: string): boolean {
	return /relate|cypher/i.test(toolName);
}

/** Parse the --output json effect array into ordered events + metrics. */
export function parseEffects(
	raw: unknown[],
	now: () => string = () => new Date().toISOString(),
): ParsedRun {
	const events: Event[] = [];
	let seq = 0;
	let toolCalls = 0;
	let failedAttempts = 0;
	let contaminated = false;
	let finalFeedback: unknown = null;
	const push = (kind: z.infer<typeof EventKind>, payload: unknown) => {
		events.push({ ts: now(), seq: seq++, kind, payload });
	};

	for (const entry of raw) {
		const e = entry as RawEffect;
		if (e.type !== "effect" || !e.detail) continue;
		const toolName = e.detail.toolName ?? "";
		if (e.detail.kind === "tool" && toolName && isContamination(toolName))
			contaminated = true;

		if (e.detail.kind === "skill") {
			push("skill_loaded", { toolName, status: e.state?.status });
			continue;
		}
		if (e.detail.kind !== "tool") continue;

		const op = craftOpOf(toolName);
		if (!op) continue; // not a craft tool (file_read, bash, ...) — not counted as tool calls

		toolCalls += 1;
		const failed = e.state?.status === "failed";
		if (failed) failedAttempts += 1;
		let output: unknown = null;
		try {
			output = e.state?.outputText ? JSON.parse(e.state.outputText) : null;
		} catch {
			output = e.state?.outputText ?? null;
		}
		push("tool_call", {
			tool: op,
			toolName,
			input: e.detail.input,
			status: e.state?.status,
		});
		push("tool_feedback", { tool: op, toolName, failed, output });
		if (
			output &&
			typeof output === "object" &&
			"craftable" in (output as object)
		) {
			finalFeedback = output;
			if (op === "craft") push("craft_result", output);
		}
	}
	return { events, toolCalls, failedAttempts, contaminated, finalFeedback };
}

/** Append-only JSONL event writer: one line per event, never edited in place. */
export class EventLogWriter {
	private seq = 0;
	private file: string;
	constructor(file: string) {
		this.file = file;
		mkdirSync(dirname(file), { recursive: true });
	}
	append(
		kind: z.infer<typeof EventKind>,
		payload: unknown,
		ts: string = new Date().toISOString(),
	): Event {
		const ev: Event = { ts, seq: this.seq++, kind, payload };
		appendFileSync(this.file, JSON.stringify(ev) + "\n");
		return ev;
	}
}

/** Build the RunMeta written on completion (contracts/event-log.ts). */
export function buildRunMeta(args: {
	runId: string;
	role: "teacher" | "student";
	condition: "none" | "transcript" | "skill" | null;
	scenario: {
		taskId: string;
		tier: "traditional" | "derived" | "invented";
		heldOut: boolean;
	};
	dir: string;
	parsed: ParsedRun;
	durationMs: number;
	exportJson: {
		session_id?: string | null;
		steps?: number;
		usage?: { input_tokens?: number; output_tokens?: number };
		cost_usd?: number;
	};
	modelAlias: string;
	cliVersion: string;
	exitCode: number;
	outcome: "success" | "fail" | "timeout";
	maxToolCalls?: number | undefined;
	skillId?: string | null | undefined;
}): RunMeta {
	// CODE-REVIEW A4: classify why a failed run failed (signals: exitCode 3 =
	// time limit; toolCalls at the cap with refused calls = budget; contaminated
	// flag; otherwise a plain fail = gave up / error)
	const failureReason: "budget" | "timeout" | "turns" | "gave_up" | "contaminated" | null =
		args.parsed.contaminated
			? "contaminated"
			: // budget first: the MCP cap ends the run with exitCode 3, so a capped
				// run is budget exhaustion even though the exit code reads as timeout
				args.maxToolCalls !== undefined && args.parsed.toolCalls >= args.maxToolCalls
					? "budget"
					: args.outcome === "timeout" || args.exitCode === 3
						? "timeout"
						: args.outcome === "fail"
							? "gave_up"
							: null;
	return {
		runId: args.runId,
		role: args.role,
		condition: args.condition,
		taskId: args.scenario.taskId,
		tier: args.scenario.tier,
		heldOut: args.scenario.heldOut,
		dir: args.dir,
		outcome: args.parsed.contaminated ? "fail" : args.outcome,
		durationMs: args.durationMs,
		toolCalls: args.parsed.toolCalls,
		failedAttempts: args.parsed.failedAttempts,
		sessionId: args.exportJson.session_id ?? null,
		steps: args.exportJson.steps ?? 0,
		inputTokens: args.exportJson.usage?.input_tokens ?? 0,
		outputTokens: args.exportJson.usage?.output_tokens ?? 0,
		costUsd: args.exportJson.cost_usd ?? 0,
		modelAlias: args.modelAlias,
		failureReason,
		round: process.env.SKILLCRAFT_ROUND ?? "dev",
		skillId: args.skillId ?? null,
		cliVersion: args.cliVersion,
		exitCode: args.exitCode,
	};
}
