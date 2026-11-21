import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { traditionalBook } from "@skillcraft/world";
import { describe, expect, it } from "vitest";
import { openLineageStore } from "./relate.js";

describe("lineage store (in-process @relate/relate, S3 rulings)", () => {
	it("writes lineage: task, teacher run -> skill -> student runs, evals; runs the lift query", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-relate-"));
		const store = openLineageStore(join(dir, "lineage"));
		try {
			store.upsertTask({
				taskId: "inv-bar-1",
				tier: "invented",
				targetItem: "item:bar",
			});
			store.upsertRun({
				runId: "11111111-1111-4111-8111-111111111111",
				role: "teacher",
				condition: null,
				taskId: "inv-bar-1",
				tier: "invented",
				heldOut: false,
				outcome: "success",
				toolCalls: 46,
				failedAttempts: 30,
				durationMs: 56000,
			});
			store.upsertSkill({
				skillId: "22222222-2222-4222-8222-222222222222",
				generatedByRunId: "11111111-1111-4111-8111-111111111111",
				classification: "procedure",
				exampleCount: 2,
			});
			store.edge(
				{
					label: "Run",
					key: "runId",
					value: "11111111-1111-4111-8111-111111111111",
				},
				{
					label: "Skill",
					key: "skillId",
					value: "22222222-2222-4222-8222-222222222222",
				},
				"GENERATED",
			);
			for (const [runId, condition, toolCalls, success] of [
				["33333333-3333-4333-8333-333333333333", "none", 14, false],
				["44444444-4444-4444-8444-444444444444", "skill", 4, true],
			] as const) {
				store.upsertRun({
					runId,
					role: "student",
					condition,
					taskId: "inv-bar-1",
					tier: "invented",
					heldOut: false,
					outcome: success ? "success" : "fail",
					toolCalls,
					failedAttempts: 1,
					durationMs: 30000,
				});
				store.edge(
					{
						label: "Skill",
						key: "skillId",
						value: "22222222-2222-4222-8222-222222222222",
					},
					{ label: "Run", key: "runId", value: runId },
					"USED_IN",
				);
				store.edge(
					{ label: "Run", key: "runId", value: runId },
					{ label: "Task", key: "taskId", value: "inv-bar-1" },
					"ATTEMPTED",
				);
				store.upsertEval({ runId, metric: "success", value: success ? 1 : 0 });
			}

			// skill lift query (S3 numeric-cast ruling)
			const lift = store.query<{
				condition: string;
				success: number;
				n: number;
			}>(
				`MATCH (r:Run {role:"student"})-[:ATTEMPTED]->(:Task)
         RETURN r.condition AS condition, avg(CASE WHEN r.outcome = "success" THEN 1.0 ELSE 0.0 END) AS success, count(*) AS n
         ORDER BY condition`,
			);
			expect(lift).toEqual([
				{ condition: "none", success: 0, n: 1 },
				{ condition: "skill", success: 1, n: 1 },
			]);

			// lineage chain
			const chain = store.query<{ chain: string[] }>(
				`MATCH path = (:Run {role:"teacher"})-[:GENERATED]->(:Skill)-[:USED_IN]->(r:Run)
         RETURN [n IN nodes(path) | coalesce(n.runId, n.skillId)] AS chain`,
			);
			expect(chain[0]!.chain).toEqual([
				"11111111-1111-4111-8111-111111111111",
				"22222222-2222-4222-8222-222222222222",
				"44444444-4444-4444-8444-444444444444",
			]);
		} finally {
			store.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writeRecipes stores the book post-hoc with 9-char shape templates", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-relate-"));
		const store = openLineageStore(join(dir, "lineage"));
		try {
			store.writeRecipes(traditionalBook, "traditional.book.json");
			const recipes = store.query<{ recipeId: string; shape: string | null }>(
				"MATCH (r:Recipe) RETURN r.recipeId AS recipeId, r.shape AS shape ORDER BY recipeId",
			);
			const fence = recipes.find((r) => r.recipeId === "mc:oak_fence");
			expect(fence?.shape).toBe("ABAABA..."); // planks=A, stick=B in pattern psp/psp (row-major)
			const planks = recipes.find((r) => r.recipeId === "mc:planks");
			expect(planks?.shape).toBe(null); // shapeless -> shape null (graceful degradation)
			const contains = store.query<{ n: number }>(
				"MATCH (b:Book)-[:CONTAINS]->(r:Recipe) RETURN count(r) AS n",
			);
			expect(contains[0]!.n).toBe(traditionalBook.length);
			// REQUIRES edges carry quantity + var binding into the shape
			const req = store.query<{
				itemId: string;
				quantity: number;
				v: string | null;
			}>(
				`MATCH (r:Recipe {recipeId:"mc:oak_fence"})-[e:REQUIRES]->(i:Item) RETURN i.itemId AS itemId, e.quantity AS quantity, e.var AS v ORDER BY itemId`,
			);
			expect(req).toEqual([
				{ itemId: "item:oak_planks", quantity: 4, v: "A" },
				{ itemId: "item:stick", quantity: 2, v: "B" },
			]);
		} finally {
			store.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
