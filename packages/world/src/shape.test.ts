import { describe, expect, it } from "vitest";
import {
	cloneGrid,
	type Equivalence,
	emptyGrid,
	type Grid,
	matches,
	patternVariants,
} from "./shape.js";

const P = (rows: string[]): Grid =>
	rows.map((r) => [...r].map((c) => (c === "." ? null : c)));

describe("shape matching", () => {
	it("exact: cell-for-cell only", () => {
		const stick = P(["p..", "p..", "..."]);
		expect(matches(P(["p..", "p..", "..."]), stick, "exact")).toBe(true);
		expect(matches(P([".p.", ".p.", "..."]), stick, "exact")).toBe(false); // translated
		expect(matches(P(["p..", ".p.", "..."]), stick, "exact")).toBe(false);
	});

	it("rotation_mirror: translations still illegal, rotations legal", () => {
		const stick = P(["p..", "p..", "..."]);
		expect(matches(P(["..p", "..p", "..."]), stick, "rotation_mirror")).toBe(
			true,
		); // mirror
		expect(matches(P([".p.", ".p.", "..."]), stick, "rotation_mirror")).toBe(
			false,
		); // translate
		const fence = P(["psp", "psp", "..."]);
		// 90deg cw rotation (derived by hand from the transform (r,c)->(c,2-r)):
		expect(matches(P([".pp", ".ss", ".pp"]), fence, "rotation_mirror")).toBe(
			true,
		);
		// its mirror:
		expect(matches(P(["pp.", "ss.", "pp."]), fence, "rotation_mirror")).toBe(
			true,
		);
		expect(matches(fence, cloneGrid(fence), "rotation_mirror")).toBe(true);
	});

	it("shapeless: counts only, any placement", () => {
		const log = P(["o..", "...", "..."]);
		expect(matches(P(["...", ".o.", "..."]), log, "shapeless")).toBe(true);
		expect(matches(P(["...", "...", "..o"]), log, "shapeless")).toBe(true);
		expect(matches(P(["oo.", "...", "..."]), log, "shapeless")).toBe(false); // too many
	});

	it("patternVariants: rotation_mirror yields <= 8 unique; exact yields 1", () => {
		const fence = P(["psp", "psp", "..."]);
		expect(patternVariants(fence, "exact").length).toBe(1);
		expect(
			patternVariants(fence, "rotation_mirror" as Equivalence).length,
		).toBeLessThanOrEqual(8);
		expect(patternVariants(fence, "rotation_mirror").length).toBeGreaterThan(1);
	});

	it("translate: pattern matches anywhere in the grid, same shape only", () => {
		const seat = P(["ppp", "...", "..."]);
		expect(matches(P(["ppp", "...", "..."]), seat, "translate")).toBe(true);
		expect(matches(P(["...", "ppp", "..."]), seat, "translate")).toBe(true);
		expect(matches(P(["...", "...", ".pp"]), seat, "translate")).toBe(false); // wrong shape
		expect(matches(P(["...", "...", "ppp"]), seat, "translate")).toBe(true);
		expect(matches(P(["..p", "pp.", "..."]), seat, "translate")).toBe(false); // L, not a row
	});

	it("empty grid matches nothing shaped", () => {
		expect(
			matches(emptyGrid(), P(["p..", "p..", "..."]), "rotation_mirror"),
		).toBe(false);
	});
});
