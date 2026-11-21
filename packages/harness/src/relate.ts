/** Harness-side Relate lineage store — in-process ONLY via @relate/relate.
 *
 *  Locked rulings (docs/harness-protocol.md post-S4, spike S3):
 *  - Relate is a harness-side facility; `relate serve` never runs during
 *    experiment batches (assertRelatePortsClosed guards this). No MCP, no Bolt.
 *  - Thin wrapper over contracts/graph.ts types -> Cypher (docs/graph-schema.cypher).
 *  - Parameterized queries ($param) throughout; unique constraints on
 *    Task.taskId / Run.runId / Skill.skillId.
 *  - avg() over booleans needs a numeric cast: avg(CASE WHEN x THEN 1.0 ELSE 0.0 END).
 *  - JSON lines (events.jsonl) remain the always-on source of truth; this graph
 *    is the queryable view (P2 kill criterion: drop Relate, keep JSONL).
 *  - Answer-key minimization (rule 5): held-out solutions are written to the
 *    graph only AFTER scoring that run — writeRecipes() is called post-scoring.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "@relate/relate";
import type {
	GraphEval as GraphEvalS,
	GraphRun as GraphRunS,
	GraphSkill as GraphSkillS,
} from "@skillcraft/contracts";
import type {
	Recipe as RecipeS,
	Scenario as ScenarioS,
} from "@skillcraft/contracts/scenario";
import type { z } from "zod";

type GraphEval = z.infer<typeof GraphEvalS>;
type GraphRun = z.infer<typeof GraphRunS>;
type GraphSkill = z.infer<typeof GraphSkillS>;
type Recipe = z.infer<typeof RecipeS>;
type Scenario = z.infer<typeof ScenarioS>;

export interface LineageStore {
	upsertTask(task: {
		taskId: string;
		tier: string;
		targetItem: string;
		heldOut?: boolean;
	}): void;
	upsertRun(run: GraphRun): void;
	upsertSkill(skill: GraphSkill): void;
	edge(
		from: { label: string; key: string; value: string },
		to: { label: string; key: string; value: string },
		type: string,
		props?: Record<string, unknown>,
	): void;
	upsertEval(eval_: GraphEval): void;
	/** Write the recipe book post-hoc (anti-cheat rule 5: after scoring). shape = 9-char template. */
	writeRecipes(book: Recipe[], bookId: string): void;
	query<T = Record<string, unknown>>(
		cypher: string,
		params?: Record<string, unknown>,
	): T[];
	close(): void;
}

export function openLineageStore(storePath: string): LineageStore {
	mkdirSync(dirname(storePath), { recursive: true });
	const db = Database.open(storePath);
	const conn = db.connect();
	const q = (cypher: string, params?: Record<string, unknown>) =>
		params ? conn.query(cypher, params as never) : conn.query(cypher);

	// constraints (S3: supported)
	q(
		"CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.taskId IS UNIQUE",
	);
	q(
		"CREATE CONSTRAINT run_id IF NOT EXISTS FOR (r:Run) REQUIRE r.runId IS UNIQUE",
	);
	q(
		"CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.skillId IS UNIQUE",
	);

	return {
		upsertTask(task) {
			q(
				"MERGE (t:Task {taskId: $taskId}) SET t.tier = $tier, t.targetItem = $targetItem, t.heldOut = $heldOut",
				{
					taskId: task.taskId,
					tier: task.tier,
					targetItem: task.targetItem,
					heldOut: task.heldOut ?? false,
				},
			);
		},
		upsertRun(run) {
			q(
				`MERGE (r:Run {runId: $runId}) SET r.role = $role, r.condition = $condition, r.taskId = $taskId,
         r.tier = $tier, r.heldOut = $heldOut, r.outcome = $outcome, r.toolCalls = $toolCalls,
         r.failedAttempts = $failedAttempts, r.durationMs = $durationMs`,
				{ ...run, condition: run.condition ?? null },
			);
		},
		upsertSkill(skill) {
			q(
				`MERGE (s:Skill {skillId: $skillId}) SET s.generatedByRunId = $generatedByRunId,
         s.classification = $classification, s.exampleCount = $exampleCount`,
				skill,
			);
		},
		edge(from, to, type, props) {
			const propsClause = props ? " SET e += $props" : "";
			q(
				`MATCH (a:${from.label} {${from.key}: $fromVal}), (b:${to.label} {${to.key}: $toVal})
         MERGE (a)-[e:${type}]->(b)${propsClause}`,
				{ fromVal: from.value, toVal: to.value, ...(props ? { props } : {}) },
			);
		},
		upsertEval(eval_) {
			q(
				`MATCH (r:Run {runId: $runId}) MERGE (r)-[:SCORED_BY]->(e:Eval {metric: $metric, value: $value})`,
				eval_,
			);
		},
		writeRecipes(book, bookId) {
			q("MERGE (b:Book {bookId: $bookId})", { bookId });
			for (const r of book) {
				// shape = 9-char template, one distinct letter per ingredient type (var binds into shape);
				// shapeless = shape null + counts only (graceful degradation, scenario-model ruling)
				const letters = new Map<string, string>();
				let next = 0;
				const shape =
					r.equivalence === "shapeless"
						? null
						: r.pattern
								.flat()
								.map((cell) => {
									if (cell === null) return ".";
									if (!letters.has(cell))
										letters.set(cell, String.fromCharCode(65 + next++));
									return letters.get(cell);
								})
								.join("");
				q(
					`MERGE (r:Recipe {recipeId: $recipeId}) SET r.tier = $tier, r.targetItem = $targetItem,
           r.equivalence = $equivalence, r.produces = $produces, r.shape = $shape, r.intermediate = $intermediate
           WITH r MATCH (b:Book {bookId: $bookId}) MERGE (b)-[:CONTAINS]->(r)`,
					{
						recipeId: r.recipeId,
						tier: r.tier,
						targetItem: r.targetItem,
						equivalence: r.equivalence,
						produces: r.produces,
						shape,
						intermediate: r.intermediate,
						bookId,
					},
				);
				// REQUIRES: one edge per ingredient type, quantity + var; PRODUCES edge to target
				for (const [itemId, varLetter] of letters) {
					const quantity = r.pattern.flat().filter((c) => c === itemId).length;
					q(
						`MATCH (r:Recipe {recipeId: $recipeId}) MERGE (i:Item {itemId: $itemId})
             MERGE (r)-[:REQUIRES {quantity: $quantity, var: $varLetter}]->(i)`,
						{ recipeId: r.recipeId, itemId, quantity, varLetter },
					);
				}
				if (r.equivalence === "shapeless") {
					for (const cell of r.pattern.flat()) {
						if (cell === null) continue;
						q(
							`MATCH (r:Recipe {recipeId: $recipeId}) MERGE (i:Item {itemId: $itemId})
               MERGE (r)-[e:REQUIRES {quantity: 1}]->(i) SET e.var = null`,
							{ recipeId: r.recipeId, itemId: cell },
						);
					}
				}
				q(
					`MATCH (r:Recipe {recipeId: $recipeId}) MERGE (i:Item {itemId: $targetItem})
           MERGE (r)-[:PRODUCES {quantity: $produces}]->(i)`,
					{
						recipeId: r.recipeId,
						targetItem: r.targetItem,
						produces: r.produces,
					},
				);
			}
		},
		query<T>(cypher: string, params?: Record<string, unknown>) {
			return q(cypher, params).rows as T[];
		},
		close() {
			db.checkpoint(); // WAL flush; the embedded engine has no close() (v1.2.0 API)
		},
	};
}

export type { Scenario };
