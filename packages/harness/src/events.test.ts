import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	craftOpOf,
	EventLogWriter,
	parseEffects,
	type RawEffect,
} from "./events.js";

const fb = (craftable: boolean, wouldProduce: string | null) =>
	JSON.stringify({
		craftable,
		wouldProduce,
		grid: [
			[null, null, null],
			[null, null, null],
			[null, null, null],
		],
		inventory: {},
	});

const toolEffect = (
	toolName: string,
	status: string,
	outputText = "",
): RawEffect => ({
	type: "effect",
	detail: { kind: "tool", toolName, input: { item: "x", slot: 0 } },
	state: { status, outputText },
});

describe("effect parser (S6 rulings)", () => {
	it("parses namespaced toolNames by suffix match, never bare-name equality", () => {
		expect(craftOpOf("mcp_skillcraft.place")).toBe("place");
		expect(craftOpOf("mcp_skillcraft_s6.place")).toBe(null); // different server
		expect(craftOpOf("mcp_skillcraft_s6.place", "skillcraft-s6")).toBe("place"); // dash-normalized server
		expect(craftOpOf("mcp_skillcraft.craft")).toBe("craft");
		expect(craftOpOf("place")).toBe(null); // bare name must NOT match
		expect(craftOpOf("mcp_skillcraft_place")).toBe(null); // underscore separator is NOT the format
		expect(craftOpOf("mcp_other_place")).toBe(null); // wrong server
		expect(craftOpOf("mcp_skillcraft.file_read")).toBe(null); // not a craft op
	});

	it("counts tool effects, not turns; failed attempts counted from status", () => {
		const raw = [
			toolEffect("mcp_skillcraft.place", "completed", fb(false, null)),
			toolEffect(
				"mcp_skillcraft.place",
				"failed",
				JSON.stringify({ error: "slot occupied", craftable: false }),
			),
			toolEffect("mcp_skillcraft.craft", "completed", fb(true, "item:bar")),
			{
				type: "effect",
				detail: { kind: "tool", toolName: "file_read", input: {} },
				state: { status: "completed", outputText: "..." },
			},
		];
		const parsed = parseEffects(raw);
		expect(parsed.toolCalls).toBe(3); // file_read not counted
		expect(parsed.failedAttempts).toBe(1);
		expect(parsed.events.filter((e) => e.kind === "tool_call")).toHaveLength(3);
		expect(
			parsed.events.filter((e) => e.kind === "tool_feedback"),
		).toHaveLength(3);
		expect(parsed.events.some((e) => e.kind === "craft_result")).toBe(true);
		expect(parsed.finalFeedback).toMatchObject({
			craftable: true,
			wouldProduce: "item:bar",
		});
	});

	it("contamination: any relate/cypher toolName voids the run", () => {
		const raw = [
			toolEffect("mcp_skillcraft.place", "completed", fb(false, null)),
			toolEffect("relate_cypher", "completed", "{}"),
		];
		expect(parseEffects(raw).contaminated).toBe(true);
		expect(
			parseEffects([
				toolEffect("mcp_skillcraft.place", "completed", fb(false, null)),
			]).contaminated,
		).toBe(false);
	});

	it("skill effects become skill_loaded events", () => {
		const raw = [
			{
				type: "effect",
				detail: { kind: "skill", toolName: "skill.read" },
				state: { status: "completed" },
			},
		];
		const parsed = parseEffects(raw);
		expect(parsed.events[0]!.kind).toBe("skill_loaded");
	});
});

describe("EventLogWriter", () => {
	it("appends JSONL with monotonic seq, one line per event", async () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-events-"));
		const file = join(dir, "events.jsonl");
		const w = new EventLogWriter(file);
		w.append("run_start", { runId: "r1" }, "2026-01-01T00:00:00.000Z");
		w.append("tool_call", { tool: "place" }, "2026-01-01T00:00:01.000Z");
		const lines = readFileSync(file, "utf8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ seq: 0, kind: "run_start" });
		expect(lines[1]).toMatchObject({ seq: 1, kind: "tool_call" });
		// round-trips through the frozen Event schema
		const { Event } = await import("@skillcraft/contracts/event-log");
		for (const l of lines) expect(Event.parse(l)).toBeTruthy();
	});
});
