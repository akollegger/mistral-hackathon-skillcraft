/** Hidden recipe books + scenarios for the three tiers (event-day dataset, seeded from
 *  actual-Minecraft research; see docs/scenario-model.md). Patterns are 3x3 row-major.
 *  NEVER serialize book/recipeReference to prompts. */

import type {
	GridPattern as GridPatternS,
	Recipe as RecipeS,
	Scenario as ScenarioS,
} from "@skillcraft/contracts";
import type { z } from "zod";

type Recipe = z.infer<typeof RecipeS>;
type Scenario = z.infer<typeof ScenarioS>;
type GridPattern = z.infer<typeof GridPatternS>;

/** Letter-bound pattern builder: chars map to real item ids, "." = empty. */
const P = (rows: string[], dict: Record<string, string>): GridPattern =>
	rows.map((row) =>
		[...row].map((ch) => (ch === "." ? null : dict[ch]!)),
	) as GridPattern;

// -- Traditional tier (canonical Minecraft recipes; letters bound to real ids) --

const MC = {
	o: "minecraft:oak_log",
	p: "minecraft:oak_planks",
	s: "minecraft:stick",
	c: "minecraft:coal",
	e: "derived:seat",
	f: "invented:foo",
	m: "invented:meh",
	z: "invented:fiz",
};

export const traditionalBook: Recipe[] = [
	{
		recipeId: "mc:planks",
		tier: "traditional",
		targetItem: "minecraft:oak_planks",
		produces: 4,
		pattern: P(["o..", "...", "..."], MC),
		equivalence: "shapeless",
		intermediate: true,
		partialCreditRules: null,
	},
	{
		recipeId: "mc:stick",
		tier: "traditional",
		targetItem: "minecraft:stick",
		produces: 4,
		pattern: P(["p..", "p..", "..."], MC),
		equivalence: "rotation_mirror",
		intermediate: true,
		partialCreditRules: null,
	},
	{
		recipeId: "mc:torch",
		tier: "traditional",
		targetItem: "minecraft:torch",
		produces: 4,
		pattern: P(["c..", "s..", "..."], MC),
		equivalence: "rotation_mirror",
		intermediate: false,
		partialCreditRules: null,
	},
	{
		recipeId: "mc:crafting_table",
		tier: "traditional",
		targetItem: "minecraft:crafting_table",
		produces: 1,
		pattern: P(["pp.", "pp.", "..."], MC),
		equivalence: "rotation_mirror",
		intermediate: false,
		partialCreditRules: null,
	},
	{
		recipeId: "mc:wooden_pickaxe",
		tier: "traditional",
		targetItem: "minecraft:wooden_pickaxe",
		produces: 1,
		pattern: P(["ppp", ".s.", ".s."], MC),
		equivalence: "rotation_mirror",
		intermediate: false,
		partialCreditRules: null,
	},
	{
		recipeId: "mc:oak_fence",
		tier: "traditional",
		targetItem: "minecraft:oak_fence",
		produces: 3,
		pattern: P(["psp", "psp", "..."], MC),
		equivalence: "rotation_mirror",
		intermediate: false,
		partialCreditRules: null,
	},
];

export const pickaxeScenario: Scenario = {
	taskId: "trad-pickaxe-1",
	tier: "traditional",
	targetItem: "minecraft:wooden_pickaxe",
	inventory: new Map([
		["minecraft:oak_planks", 5],
		["minecraft:stick", 2],
		["minecraft:cobblestone", 1],
	]),
	depth: 1,
	heldOut: false,
	recipeReference: "mc:wooden_pickaxe",
};

// -- Traditional composed chain: canonical recipes only, so STILL traditional --

export const fenceFromLogsScenario: Scenario = {
	taskId: "trad-fence-1",
	tier: "traditional",
	targetItem: "minecraft:oak_fence",
	inventory: new Map([
		["minecraft:oak_log", 2],
		["minecraft:coal", 1],
	]), // coal = distractor / torch option
	depth: 3,
	heldOut: false,
	recipeReference: "mc:oak_fence",
};

// -- Derived tier: plausible but NOT canonical ("wooden stool from logs").
//    New item: seat = 3 planks in any row (translate equivalence).
//    stool = seat on top, 3 sticks in a row below (legs). --

const DV = { ...MC };

export const derivedBook: Recipe[] = [
	...traditionalBook, // planks + sticks intermediates compose into the stool
	{
		recipeId: "dv:seat",
		tier: "derived",
		targetItem: "derived:seat",
		produces: 1,
		pattern: P(["ppp", "...", "..."], DV),
		equivalence: "translate",
		intermediate: true,
		partialCreditRules: null,
	},
	{
		recipeId: "dv:stool",
		tier: "derived",
		targetItem: "derived:wooden_stool",
		produces: 1,
		pattern: P([".e.", "sss", "..."], DV),
		equivalence: "rotation_mirror",
		intermediate: false,
		partialCreditRules:
			"seat crafted but stool uncrafted = 0.5 partial credit; well-formed attempts reported even on failure",
	},
];

export const stoolFromLogsScenario: Scenario = {
	taskId: "der-stool-1",
	tier: "derived",
	targetItem: "derived:wooden_stool",
	inventory: new Map([
		["minecraft:oak_log", 3],
		["minecraft:coal", 1],
	]), // 3 logs: 12 planks, budget 3 (seat) + 2 (sticks)
	depth: 4,
	heldOut: false,
	recipeReference: "dv:stool",
};

// -- Invented tier (foo/meh/fiz -> bar; nothing in training; pure feedback search) --

export const inventedScenario: Scenario = {
	taskId: "inv-bar-1",
	tier: "invented",
	targetItem: "invented:bar",
	inventory: new Map([
		["invented:foo", 2],
		["invented:meh", 1],
		["invented:fiz", 3],
	]),
	depth: 1,
	heldOut: false,
	recipeReference: "inv:bar",
};

export const inventedBook: Recipe[] = [
	{
		recipeId: "inv:bar",
		tier: "invented",
		targetItem: "invented:bar",
		produces: 2,
		pattern: P(["f..", "m..", "z.."], {
			f: "invented:foo",
			m: "invented:meh",
			z: "invented:fiz",
		}),
		equivalence: "exact",
		intermediate: false,
		partialCreditRules: null,
	},
	{
		// held-out: teacher never sees this. Matched in complexity to inv:bar
		// (3-item column, 3 item types) so taught-vs-held-out is not confounded
		// with pattern complexity (pilot finding 2026-11-21).
		recipeId: "inv:qux",
		tier: "invented",
		targetItem: "invented:qux",
		produces: 2,
		pattern: P(["z..", "f..", "m.."], {
			z: "invented:fiz",
			f: "invented:foo",
			m: "invented:meh",
		}),
		equivalence: "exact",
		intermediate: false,
		partialCreditRules: null,
	},
];

/** Held-out invented task (teacher never sees it; students judged cold). */
export const heldOutScenario: Scenario = {
	taskId: "inv-qux-heldout",
	tier: "invented",
	targetItem: "invented:qux",
	inventory: new Map([
		["invented:foo", 1],
		["invented:meh", 2],
		["invented:fiz", 2],
	]),
	depth: 1,
	heldOut: true,
	recipeReference: "inv:qux",
};
