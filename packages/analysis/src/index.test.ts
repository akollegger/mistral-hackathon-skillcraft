import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadRuns,
	sampleEfficiency,
	skillLift,
	skillQuality,
	strategyQuality,
} from "./index.js";

function mkRun(
	dir: string,
	runId: string,
	role: string,
	condition: string | null,
	tier: string,
	heldOut: boolean,
	taskId: string,
	toolCalls: number,
	failed: number,
	craftedTarget: string | null,
	skill?: { classification: string; exampleCount: number },
) {
	const rd = join(dir, "runs", runId);
	mkdirSync(rd, { recursive: true });
	writeFileSync(
		join(rd, "run.meta.json"),
		JSON.stringify({
			runId,
			role,
			condition,
			taskId,
			tier,
			heldOut,
			dir: rd,
			outcome: craftedTarget ? "success" : "fail",
			durationMs: 1000,
			toolCalls,
			failedAttempts: failed,
			sessionId: null,
			steps: 1,
			inputTokens: 0,
			outputTokens: 0,
			costUsd: 0,
			modelAlias: "m",
			cliVersion: "3.1.4",
			exitCode: 0,
		}),
	);
	const events = [
		{ ts: "2026-01-01T00:00:00.000Z", seq: 0, kind: "run_start", payload: {} },
		...(craftedTarget
			? [
					{
						ts: "2026-01-01T00:00:01.000Z",
						seq: 1,
						kind: "craft_result",
						payload: { produced: craftedTarget },
					},
				]
			: []),
		{ ts: "2026-01-01T00:00:02.000Z", seq: 2, kind: "run_end", payload: {} },
	];
	writeFileSync(
		join(rd, "events.jsonl"),
		events.map((e) => JSON.stringify(e)).join("\n") + "\n",
	);
	if (skill)
		writeFileSync(
			join(rd, "skill.meta.json"),
			JSON.stringify({
				skillId: "44444444-4444-4444-8444-" + runId.slice(0, 12),
				...skill,
			}),
		);
}

describe("P5 analysis tables", () => {
	it("computes skill lift, strategy quality, sample efficiency, skill quality from run logs", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-analysis-"));
		const targets = { "inv-bar-1": "item:bar" };
		// teacher run (has skill meta, procedure, 2 examples)
		mkRun(
			dir,
			"11111111-1111-4111-8111-111111111111",
			"teacher",
			null,
			"invented",
			false,
			"inv-bar-1",
			100,
			5,
			"item:bar",
			{ classification: "procedure", exampleCount: 2 },
		);
		// students: none x2 (1 success), skill x2 (2 success)
		mkRun(
			dir,
			"22222222-2222-4222-8222-222222222221",
			"student",
			"none",
			"invented",
			false,
			"inv-bar-1",
			14,
			3,
			"item:bar",
		);
		mkRun(
			dir,
			"22222222-2222-4222-8222-222222222222",
			"student",
			"none",
			"invented",
			false,
			"inv-bar-1",
			20,
			8,
			null,
		);
		mkRun(
			dir,
			"33333333-3333-4333-8333-333333333331",
			"student",
			"skill",
			"invented",
			false,
			"inv-bar-1",
			4,
			1,
			"item:bar",
			{ classification: "procedure", exampleCount: 2 },
		);
		mkRun(
			dir,
			"33333333-3333-4333-8333-333333333332",
			"student",
			"skill",
			"invented",
			true,
			"inv-bar-1",
			6,
			0,
			"item:bar",
			{ classification: "procedure", exampleCount: 2 },
		);

		const runs = loadRuns(dir, targets);
		expect(runs).toHaveLength(5);

		const lift = skillLift(runs).find(
			(r) => r.tier === "invented" && r.heldOut === false,
		) as Record<string, unknown>;
		expect(lift.none).toBe(0.5);
		expect(lift.skill).toBe(1);
		expect(lift.lift).toBe(0.5);

		const strat = strategyQuality(runs).find(
			(r) => r.tier === "invented" && r.condition === "skill",
		) as Record<string, unknown>;
		expect(strat.avgToolCalls).toBe(5);
		expect(strat.avgFailedAttempts).toBe(0.5);

		const eff = sampleEfficiency(runs);
		expect(eff).toEqual([{ examples: 2, n: 2, successRate: 1 }]);

		const qual = skillQuality(runs);
		expect(qual).toEqual([
			{
				skillClassification: "procedure",
				n: 2,
				successRate: 1,
				avgToolCalls: 5,
			},
		]);

		rmSync(dir, { recursive: true, force: true });
	});
});
