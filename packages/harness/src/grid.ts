/** Shared experiment-grid definition (P3 teachers + P4 conditions + P6 demo matrix).
 *  See docs/demo-matrix.md for the 6-run per-scenario demo set.
 */

import type { Scenario as ScenarioS } from "@skillcraft/contracts/scenario";
import type { Book } from "@skillcraft/world";
import {
	derivedBook,
	fenceFromLogsScenario,
	heldOutScenario,
	inventedBook,
	inventedBookTaught,
	inventedScenario,
	pickaxeScenario,
	stoolFromLogsScenario,
	traditionalBook,
	traditionalBookTaught,
} from "@skillcraft/world";
import type { z } from "zod";

type Scenario = z.infer<typeof ScenarioS>;

export interface GridCell {
	tier: "traditional" | "derived" | "invented";
	label: string;
	scenario: Scenario;
	book: Book;
	heldOut: boolean;
}

/** All cells. Taught = the task the teacher solves and writes the skill for;
 *  held-out = related-but-different task the teacher never saw. */
export const CELLS: GridCell[] = [
	{
		tier: "traditional",
		label: "pickaxe",
		scenario: pickaxeScenario,
		book: traditionalBookTaught,
		heldOut: false,
	},
	{
		tier: "traditional",
		label: "fence-heldout",
		scenario: fenceFromLogsScenario,
		book: traditionalBook,
		heldOut: true,
	},
	{
		tier: "derived",
		label: "stool",
		scenario: stoolFromLogsScenario,
		book: derivedBook,
		heldOut: false,
	},
	{
		tier: "invented",
		label: "bar",
		scenario: inventedScenario,
		book: inventedBookTaught,
		heldOut: false,
	},
	{
		tier: "invented",
		label: "qux-heldout",
		scenario: heldOutScenario,
		book: inventedBook,
		heldOut: true,
	},
];

/** Taught cells — the teacher runs (P3) and skill generation happen here. */
export const TAUGHT_CELLS = CELLS.filter((c) => !c.heldOut);

/** Scenario with heldOut stamped from the grid cell (A1: the cell is the source
 *  of truth; scenario objects may disagree). */
export const cellScenario = (cell: GridCell): GridCell["scenario"] => ({
	...cell.scenario,
	heldOut: cell.heldOut,
});

export const TARGETS: Record<string, string> = Object.fromEntries(
	CELLS.map((c) => [c.scenario.taskId, c.scenario.targetItem]),
);
