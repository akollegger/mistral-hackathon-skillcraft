/** Crafting world. Feedback contract (frozen): EVERY place/take/clear/craft — including
 *  errors — returns {craftable, wouldProduce, grid, inventory}. Recipes are functions:
 *  pattern at locations produces N of targetItem. */

import type {
	Quantity as QuantityS,
	Recipe as RecipeS,
	Scenario as ScenarioS,
} from "@skillcraft/contracts";
import type { z } from "zod";

type Recipe = z.infer<typeof RecipeS>;
type Scenario = z.infer<typeof ScenarioS>;
type Quantity = z.infer<typeof QuantityS>;

import {
	cloneGrid,
	type Equivalence,
	emptyGrid,
	type Grid,
	matches,
} from "./shape.js";

export type Book = Recipe[];

export interface Feedback {
	craftable: boolean;
	wouldProduce: string | null;
	grid: Grid;
	inventory: Map<string, number>;
}

export class World {
	readonly scenario: Scenario;
	readonly book: Book; // hidden recipe book; never serialized to prompts
	private grid: Grid = emptyGrid();
	private inventory: Map<string, number>;

	constructor(scenario: Scenario, book: Book) {
		this.scenario = scenario;
		this.book = book;
		this.inventory = new Map(scenario.inventory);
	}

	private feedback(): Feedback {
		const wouldProduce = this.wouldProduce();
		return {
			craftable: wouldProduce !== null,
			wouldProduce,
			grid: cloneGrid(this.grid),
			inventory: new Map(this.inventory),
		};
	}

	/** First recipe in the hidden book the current grid matches. */
	wouldProduce(): string | null {
		for (const r of this.book) {
			if (matches(this.grid, r.pattern as Grid, r.equivalence as Equivalence))
				return r.targetItem;
		}
		return null;
	}

	place(item: string, slot: number): Feedback {
		if (slot < 0 || slot > 8) throw new Error(`Slot out of range: ${slot}`);
		const r = Math.floor(slot / 3),
			c = slot % 3;
		if (this.grid[r]![c])
			throw Object.assign(new Error(`Slot ${slot} occupied`), {
				feedback: this.feedback(),
			});
		const have = this.inventory.get(item) ?? 0;
		if (have < 1)
			throw Object.assign(new Error(`No ${item} in inventory`), {
				feedback: this.feedback(),
			});
		this.inventory.set(item, have - 1);
		this.grid[r]![c] = item;
		return this.feedback();
	}

	take(slot: number): Feedback {
		if (slot < 0 || slot > 8) throw new Error(`Slot out of range: ${slot}`);
		const r = Math.floor(slot / 3),
			c = slot % 3;
		const item = this.grid[r]![c];
		if (!item)
			throw Object.assign(new Error(`Slot ${slot} empty`), {
				feedback: this.feedback(),
			});
		this.grid[r]![c] = null;
		this.inventory.set(item, (this.inventory.get(item) ?? 0) + 1);
		return this.feedback();
	}

	clear(): Feedback {
		for (const row of this.grid)
			for (let c = 0; c < 3; c++) {
				const item = row[c];
				if (item) {
					this.inventory.set(item, (this.inventory.get(item) ?? 0) + 1);
					row[c] = null;
				}
			}
		return this.feedback();
	}

	/** Consume matched pattern, credit `produces` quantity of targetItem. */
	craft(): { success: boolean; produced: string | null; feedback: Feedback } {
		const fb = this.feedback();
		if (!fb.craftable || !fb.wouldProduce) {
			throw Object.assign(new Error("Grid is not craftable"), { feedback: fb });
		}
		const recipe = this.book.find((r) => r.targetItem === fb.wouldProduce)!;
		this.grid = emptyGrid(); // pattern inputs consumed
		this.inventory.set(
			recipe.targetItem,
			(this.inventory.get(recipe.targetItem) ?? 0) + recipe.produces,
		);
		return {
			success: true,
			produced: recipe.targetItem,
			feedback: this.feedback(),
		};
	}

	get state(): Feedback {
		return this.feedback();
	}
}

export type { Quantity };
