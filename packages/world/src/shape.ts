/** Grid + shape matching. Recipes-as-functions ruling (docs/scenario-model.md):
 *  exact = cell-for-cell; rotation_mirror = 8 variants; shapeless = counts only. */

import type { GridPattern as GridPatternS } from "@skillcraft/contracts";
import type { z } from "zod";

type GridPattern = z.infer<typeof GridPatternS>;

export type Grid = (string | null)[][];
export type Equivalence =
	| "exact"
	| "shapeless"
	| "rotation_mirror"
	| "translate";

export const emptyGrid = (): Grid => [
	[null, null, null],
	[null, null, null],
	[null, null, null],
];

export const cloneGrid = (g: Grid): Grid => g.map((row) => [...row]);
export const gridFromPattern = (p: GridPattern): Grid => cloneGrid(p as Grid);

const rotate = (g: Grid): Grid => {
	// 90deg clockwise
	const out = emptyGrid();
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) out[c]![2 - r] = g[r]![c]!;
	return out;
};
const mirror = (g: Grid): Grid => g.map((row) => [...row].reverse());

const translate = (g: Grid, dr: number, dc: number): Grid => {
	// shift the pattern's occupied cells by (dr, dc); overhang = no match
	const out = emptyGrid();
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const v = g[r]![c];
			if (v == null) continue;
			const r2 = r + dr,
				c2 = c + dc;
			if (r2 < 0 || r2 > 2 || c2 < 0 || c2 > 2) continue;
			out[r2]![c2] = v;
		}
	return out;
};

const boundingBox = (
	g: Grid,
): { r0: number; c0: number; r1: number; c1: number } => {
	let r0 = 3,
		c0 = 3,
		r1 = -1,
		c1 = -1;
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			if (g[r]![c] != null) {
				r0 = Math.min(r0, r);
				c0 = Math.min(c0, c);
				r1 = Math.max(r1, r);
				c1 = Math.max(c1, c);
			}
		}
	return { r0, c0, r1, c1 };
};

/** All variants a pattern may match under, per equivalence. translate = anywhere. */
export const patternVariants = (p: Grid, eq: Equivalence): Grid[] => {
	if (eq === "shapeless") return [p];
	const variants: Grid[] = [];
	const seen = new Set<string>();
	const push = (g: Grid) => {
		const key = JSON.stringify(g);
		if (!seen.has(key)) {
			seen.add(key);
			variants.push(g);
		}
	};
	if (eq === "translate") {
		const { r0, c0, r1, c1 } = boundingBox(p);
		for (let dr = -r0; dr <= 2 - r1; dr++)
			for (let dc = -c0; dc <= 2 - c1; dc++) push(translate(p, dr, dc));
		return variants;
	}
	let cur = cloneGrid(p);
	if (eq === "exact") {
		push(cur);
		return variants;
	}
	for (let i = 0; i < 4; i++) {
		push(cur);
		push(mirror(cur));
		cur = rotate(cur);
	}
	return variants;
};

const counts = (g: (string | null)[][]) => {
	const m = new Map<string, number>();
	for (const row of g)
		for (const cell of row) if (cell) m.set(cell, (m.get(cell) ?? 0) + 1);
	return m;
};

/** Does the grid match the pattern under the equivalence rule? */
export const matches = (
	grid: Grid,
	pattern: Grid,
	eq: Equivalence,
): boolean => {
	if (eq === "shapeless") {
		const a = counts(grid),
			b = counts(pattern);
		if (a.size !== b.size) return false;
		for (const [k, n] of a) if (b.get(k) !== n) return false;
		return true;
	}
	for (const v of patternVariants(pattern, eq)) {
		let ok = true;
		for (let r = 0; r < 3 && ok; r++)
			for (let c = 0; c < 3 && ok; c++) {
				if (v[r]![c] === null) {
					if (grid[r]![c] !== null) ok = false;
				} else if (grid[r]![c] !== v[r]![c]) {
					ok = false;
				}
			}
		if (ok) return true;
	}
	return false;
};

