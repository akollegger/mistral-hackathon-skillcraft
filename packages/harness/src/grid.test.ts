/** CODE-REVIEW A1/A2 regression tests: heldOut stamped from the cell, and no
 *  held-out recipe is present in (or craftable from) any taught cell's book. */
import { describe, expect, it } from "vitest";
import { CELLS, TAUGHT_CELLS, cellScenario } from "./grid.js";

describe("grid cells (CODE-REVIEW A1)", () => {
	it("cellScenario stamps heldOut from the cell, not the scenario object", () => {
		for (const cell of CELLS) {
			expect(cellScenario(cell).heldOut).toBe(cell.heldOut);
		}
		// the known disagreement: fence scenario says false, cell says true
		const fence = CELLS.find((c) => c.label === "fence-heldout")!;
		expect(fence.scenario.heldOut).toBe(false);
		expect(cellScenario(fence).heldOut).toBe(true);
	});
});

describe("book scoping (CODE-REVIEW A2)", () => {
	it("taught cells' books exclude the tier's held-out recipe", () => {
		const heldOutRecipeByTier: Record<string, string> = {
			traditional: "mc:oak_fence",
			invented: "inv:qux",
		};
		for (const cell of TAUGHT_CELLS) {
			const heldOutId = heldOutRecipeByTier[cell.tier];
			if (!heldOutId) continue; // derived tier has no held-out cell
			expect(
				cell.book.some((r) => r.recipeId === heldOutId),
				`${cell.label} book must not contain ${heldOutId}`,
			).toBe(false);
		}
	});

	it("held-out recipes are absent from the whole tier's full book used by held-out cells only", () => {
		// the held-out cell keeps the full book (its own recipe must be craftable);
		// taught cells use the scoped book (previous test)
		const fence = CELLS.find((c) => c.label === "fence-heldout")!;
		const qux = CELLS.find((c) => c.label === "qux-heldout")!;
		expect(fence.book.some((r) => r.recipeId === "mc:oak_fence")).toBe(true);
		expect(qux.book.some((r) => r.recipeId === "inv:qux")).toBe(true);
	});
});
