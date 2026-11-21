import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderTranscript, succeeded } from "./transcript.js";

const events = [
	{ ts: "2026-01-01T00:00:00.000Z", seq: 0, kind: "run_start", payload: {} },
	{
		ts: "2026-01-01T00:00:01.000Z",
		seq: 1,
		kind: "tool_call",
		payload: {
			tool: "place",
			input: { item: "item:foo", slot: 0 },
			status: "completed",
		},
	},
	{
		ts: "2026-01-01T00:00:01.001Z",
		seq: 2,
		kind: "tool_feedback",
		payload: {
			tool: "place",
			failed: false,
			output: { craftable: false, wouldProduce: null },
		},
	},
	{
		ts: "2026-01-01T00:00:02.000Z",
		seq: 3,
		kind: "tool_call",
		payload: { tool: "craft", input: {}, status: "failed" },
	},
	{
		ts: "2026-01-01T00:00:02.001Z",
		seq: 4,
		kind: "tool_feedback",
		payload: {
			tool: "craft",
			failed: true,
			output: {
				craftable: false,
				wouldProduce: null,
				error: "Grid is not craftable",
			},
		},
	},
	{
		ts: "2026-01-01T00:00:03.000Z",
		seq: 5,
		kind: "tool_call",
		payload: { tool: "craft", input: {}, status: "completed" },
	},
	{
		ts: "2026-01-01T00:00:03.001Z",
		seq: 6,
		kind: "craft_result",
		payload: {
			produced: "item:bar",
			craftable: true,
			wouldProduce: "item:bar",
		},
	},
];

describe("transcript renderer", () => {
	it("renders raw tool-call trace with feedback lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-tr-"));
		const f = join(dir, "events.jsonl");
		writeFileSync(f, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
		const t = renderTranscript(f, { taskId: "inv-bar-1", outcome: "success" });
		expect(t).toContain("# Transcript — task inv-bar-1");
		expect(t).toContain('place({"item":"item:foo","slot":0})');
		expect(t).toContain("craftable=false wouldProduce=?");
		expect(t).toContain('error="Grid is not craftable"');
		expect(t).toContain("craft_result");
		rmSync(dir, { recursive: true, force: true });
	});

	it("succeeded() true only when a craft_result produced the target", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-tr-"));
		const f = join(dir, "events.jsonl");
		writeFileSync(f, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
		expect(succeeded(f, "item:bar")).toBe(true);
		expect(succeeded(f, "item:qux")).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});
});
