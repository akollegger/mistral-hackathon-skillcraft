/** Skillcraft event log (spec level).
 *  One JSON-Line file per run: results/runs/<runId>/events.jsonl.
 *  Harness appends; analysis and playback consume. Never edited in place.
 *  A run is replayable from these lines alone — that is the playback contract. */
import { z } from "zod";
import { ToolCall, ToolFeedback } from "./tool.js";

export const EventKind = z.enum([
	"run_start",
	"prompt",
	"tool_call",
	"tool_feedback",
	"final_grid",
	"craft_result",
	"skill_loaded",
	"run_end",
]);

export const Event = z.object({
	ts: z.string().datetime(), // monotonic per run; also seq for ordering
	seq: z.number().int(),
	kind: EventKind,
	payload: z.unknown(), // narrowed per kind below (EVENT: add per-kind zod when building)
});

export const RunMeta = z.object({
	runId: z.string().uuid(),
	role: z.enum(["teacher", "student"]),
	condition: z.enum(["none", "transcript", "skill"]).nullable(), // students only
	taskId: z.string(),
	tier: z.enum(["traditional", "derived", "invented"]),
	heldOut: z.boolean(), // student judged on a task the teacher never saw
	dir: z.string(), // isolated working directory for this run
	outcome: z.enum(["success", "fail", "timeout"]).nullable(),
	durationMs: z.number().int(),
	toolCalls: z.number().int(),
	failedAttempts: z.number().int(),
	// Pass-through fields from vibe --output-dir export.json (spike S1 confirmed shape).
	sessionId: z.string().nullable(),
	steps: z.number().int(),
	inputTokens: z.number().int(),
	outputTokens: z.number().int(),
	costUsd: z.number(),
	modelAlias: z.string(), // must equal the --model passed on the spawn
	cliVersion: z.string(), // record: version skew caught us once already
	exitCode: z.number().int(), // 0/1/2/3/4 semantics per s1-notes.md
	// CODE-REVIEW A4/A5/B6: optional so metas written before round 4 still parse
	failureReason: z.enum(["budget", "timeout", "turns", "gave_up", "contaminated"]).nullable().optional(),
	round: z.string().optional(), // e.g. "r4"; set via SKILLCRAFT_ROUND at spawn time
	skillId: z.string().uuid().nullable().optional(), // skill pinned to this run (skill condition)
});
