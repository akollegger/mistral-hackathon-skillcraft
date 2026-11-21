/** Render a raw transcript (transcript.md) from a run's events.jsonl.
 *  Used for the student "transcript" condition: an agent's raw transcript of a
 *  related problem, copied into the student's fresh dir (docs/harness-protocol.md).
 */
import { readFileSync } from "node:fs";
import type { Event as EventS } from "@skillcraft/contracts/event-log";
import type { z } from "zod";

type Event = z.infer<typeof EventS>;

interface ToolCallPayload {
	tool: string;
	input?: unknown;
	status?: string;
}
interface ToolFeedbackPayload {
	tool: string;
	failed?: boolean;
	output?:
		| { craftable?: boolean; wouldProduce?: string | null; error?: string }
		| string
		| null;
}

export function renderTranscript(
	eventsPath: string,
	meta: { taskId: string; targetItem?: string; outcome?: string },
): string {
	const events = readFileSync(eventsPath, "utf8")
		.trim()
		.split("\n")
		.map((l) => JSON.parse(l) as Event);
	const lines: string[] = [
		`# Transcript — task ${meta.taskId}`,
		"",
		`Outcome: ${meta.outcome ?? "unknown"}. Raw tool-call trace of an agent working on this task:`,
		"",
	];
	for (const ev of events) {
		if (ev.kind === "tool_call") {
			const p = ev.payload as ToolCallPayload;
			lines.push(
				`- ${p.tool}(${JSON.stringify(p.input ?? {})}) [${p.status ?? "?"}]`,
			);
		} else if (ev.kind === "tool_feedback") {
			const p = ev.payload as ToolFeedbackPayload;
			const out =
				typeof p.output === "object" && p.output !== null ? p.output : {};
			const fb = `craftable=${out.craftable ?? "?"} wouldProduce=${out.wouldProduce ?? "?"}${out.error ? ` error="${out.error}"` : ""}`;
			lines.push(`  -> ${fb}`);
		} else if (ev.kind === "craft_result") {
			lines.push(`- craft_result: ${JSON.stringify(ev.payload)}`);
		} else if (ev.kind === "skill_loaded") {
			lines.push(`- skill_loaded (auto-loaded skill)`);
		}
	}
	return lines.join("\n") + "\n";
}

/** Did any craft_result produce the target item? (success criterion for scoring) */
export function succeeded(eventsPath: string, targetItem: string): boolean {
	const events = readFileSync(eventsPath, "utf8")
		.trim()
		.split("\n")
		.map((l) => JSON.parse(l) as Event);
	return events.some(
		(ev) =>
			ev.kind === "craft_result" &&
			(ev.payload as { produced?: string | null })?.produced === targetItem,
	);
}
