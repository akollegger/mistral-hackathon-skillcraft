import { describe, expect, it } from "vitest";
import {
	derivedBook,
	fenceFromLogsScenario,
	inventedBook,
	inventedScenario,
	pickaxeScenario,
	stoolFromLogsScenario,
	traditionalBook,
} from "./datasets.js";
import { emptyGrid } from "./shape.js";
import { type Feedback, World } from "./world.js";

describe("World: feedback contract on every call incl. errors", () => {
	it("place errors carry full feedback", () => {
		const w = new World(pickaxeScenario, traditionalBook);
		try {
			w.place("item:stone_pickaxe", 0);
			expect.unreachable();
		} catch (e) {
			const fb = (e as { feedback?: Feedback }).feedback!;
			expect(fb).toBeDefined();
			expect(fb.craftable).toBe(false);
			expect(fb.grid).toEqual(emptyGrid());
		}
	});

	it("pickaxe: craftable via rotation-mirrored placement of canonical recipe", () => {
		const w = new World(pickaxeScenario, traditionalBook);
		// canonical returned mirrored feedback pathway: place planks row reversed (mirror of ppp)
		for (const slot of [2, 1, 0]) w.place("item:oak_planks", slot);
		w.place("item:stick", 4);
		w.place("item:stick", 7);
		const fb = w.state;
		expect(fb.craftable).toBe(true);
		expect(fb.wouldProduce).toBe("item:wooden_pickaxe");
		const res = w.craft();
		expect(res.success && res.produced).toBe("item:wooden_pickaxe");
		expect(res.feedback.inventory.get("item:wooden_pickaxe")).toBe(1);
		expect(res.feedback.inventory.get("item:stick")).toBe(0); // consumed
	});
});

describe("World: recipes are composable functions with quantities", () => {
	it("fence-from-logs: log->planks(4), planks->sticks(4), fence(3); budgeted", () => {
		const w = new World(fenceFromLogsScenario, traditionalBook);
		// Step 1: log -> 4 planks (shapeless, any slot)
		w.place("item:oak_log", 4);
		expect(w.state.wouldProduce).toBe("item:oak_planks");
		w.craft(); // +4 planks, log consumed
		expect(w.state.inventory.get("item:oak_planks")).toBe(4);
		expect(w.state.inventory.has("item:oak_log")).toBe(true); // second log remains
		// Step 2: craft more planks from second log
		w.place("item:oak_log", 4);
		w.craft(); // +4 planks, now 8 total
		expect(w.state.inventory.get("item:oak_planks")).toBe(8);
		// Step 3: 2 planks -> 4 sticks
		w.place("item:oak_planks", 0);
		w.place("item:oak_planks", 3);
		expect(w.state.wouldProduce).toBe("item:stick");
		w.craft();
		expect(w.state.inventory.get("item:stick")).toBe(4);
		// Step 4: fence = p s p / p s p (4 planks + 2 sticks -> x3)
		w.place("item:oak_planks", 0);
		w.place("item:stick", 1);
		w.place("item:oak_planks", 2);
		w.place("item:oak_planks", 3);
		w.place("item:stick", 4);
		w.place("item:oak_planks", 5);
		const fb = w.state;
		expect(fb.craftable).toBe(true);
		expect(fb.wouldProduce).toBe("item:oak_fence");
		const res = w.craft();
		expect(res.feedback.inventory.get("item:oak_fence")).toBe(3);
		expect(res.feedback.inventory.get("item:stick")).toBe(2); // 4 - 2
	});

	it("wrong arrangement: same items, wrong shape = feedback says not craftable", () => {
		const w = new World(fenceFromLogsScenario, traditionalBook);
		w.place("item:oak_log", 0);
		w.craft(); // 4 planks
		w.place("item:oak_log", 8);
		w.craft(); // 8 planks total
		w.place("item:oak_planks", 0);
		w.place("item:oak_planks", 3);
		w.craft(); // sticks x4
		// fence-shaped rows but with a GAP (rows 0 and 2) -> no recipe matches
		w.place("item:oak_planks", 0);
		w.place("item:stick", 1);
		w.place("item:oak_planks", 2);
		w.place("item:oak_planks", 6);
		w.place("item:stick", 7);
		w.place("item:oak_planks", 8);
		expect(w.state.craftable).toBe(false);
		expect(w.state.wouldProduce).toBe(null);
	});
});

describe("World: derived tier (stool from logs: plausible, non-canonical)", () => {
	it("log->planks, planks->sticks, seat (any row), stool (seat + 3 stick legs)", () => {
		const w = new World(stoolFromLogsScenario, derivedBook);
		// planks x4
		w.place("item:oak_log", 0);
		w.craft();
		expect(w.state.inventory.get("item:oak_planks")).toBe(4);
		// sticks x4 (2 planks)
		w.place("item:oak_planks", 0);
		w.place("item:oak_planks", 3);
		w.craft();
		expect(w.state.inventory.get("item:stick")).toBe(4);
		// Need more planks: craft from remaining logs (2 left -> +8 planks)
		w.place("item:oak_log", 0);
		w.craft();
		w.place("item:oak_log", 0);
		w.craft();
		expect(w.state.inventory.get("item:oak_planks")).toBe(10);
		// seat: 3 planks in ANY row (translate) — try bottom row, why not
		w.place("item:oak_planks", 6);
		w.place("item:oak_planks", 7);
		w.place("item:oak_planks", 8);
		expect(w.state.wouldProduce).toBe("item:seat");
		w.craft();
		expect(w.state.inventory.get("item:seat")).toBe(1);
		// stool: seat above, 3 sticks in a row below
		w.place("item:seat", 1);
		w.place("item:stick", 3);
		expect(w.state.wouldProduce).toBe(null); // 1 leg: nothing
		w.place("item:stick", 4);
		expect(w.state.wouldProduce).toBe(null); // 2 legs: nothing
		w.place("item:stick", 5);
		expect(w.state.wouldProduce).toBe("item:wooden_stool");
		const res = w.craft();
		expect(res.success && res.produced).toBe("item:wooden_stool");
		expect(res.feedback.inventory.get("item:oak_log")).toBe(0); // all 3 logs used
	});
});

describe("World: invented tier", () => {
	it("foo/meh/fiz -> bar via feedback-driven search; exact equivalence", () => {
		const w = new World(inventedScenario, inventedBook);
		w.place("item:foo", 0);
		w.place("item:meh", 3);
		w.place("item:fiz", 6);
		const fb = w.state;
		expect(fb.craftable).toBe(true);
		expect(fb.wouldProduce).toBe("item:bar");
		const res = w.craft();
		expect(res.feedback.inventory.get("item:bar")).toBe(2); // produces: 2
		expect(res.feedback.inventory.get("item:fiz")).toBe(2); // had 3, spent 1
	});

	it("take returns resources; clear recovers all", () => {
		const w = new World(inventedScenario, inventedBook);
		w.place("item:foo", 0);
		w.take(0);
		expect(w.state.inventory.get("item:foo")).toBe(2);
		w.place("item:fiz", 1);
		w.clear();
		expect(w.state.inventory.get("item:fiz")).toBe(3);
		expect(w.state.grid).toEqual(emptyGrid());
	});
});
