/** Prompt templates (decided shapes from docs/harness-protocol.md).
 *
 *  Teacher: task statement + tool description + feedback contract + teaching
 *  phase ("write a skill file at skill.md") + skill rubric. The frontmatter
 *  mandate is required by the S5 ruling (loader rejects SKILL.md without
 *  YAML frontmatter; the harness validates it at acceptance time).
 *
 *  Student: identical task + tool sections, minus the teaching instruction,
 *  plus the condition injection in the verbatim placement order:
 *    none:        nothing added
 *    transcript:  transcript.md path + "an agent previously worked on a
 *                 related problem; this is its raw transcript."
 *    skill:       skill.md path + "a previous agent distilled its experience
 *                 into this skill."
 *  Condition phrasing carries no task-specific hints (word-matched stems).
 */

import type { Scenario as ScenarioS } from "@skillcraft/contracts/scenario";
import type { z } from "zod";

type Scenario = z.infer<typeof ScenarioS>;

export type StudentCondition = "none" | "transcript" | "skill";

export interface ConditionFiles {
	transcriptPath?: string;
	skillPath?: string;
}

function taskStatement(scenario: Scenario): string {
	const inv = [...scenario.inventory.entries()]
		.map(([item, qty]) => `  - ${item} x${qty}`)
		.join("\n");
	return [
		"## Task",
		"",
		`Your target item is **${scenario.targetItem}**.`,
		"",
		"Your inventory:",
		inv,
		"",
		"You have a 3x3 crafting grid. Slots are numbered 0-8, row-major:",
		"",
		"```",
		"0 1 2",
		"3 4 5",
		"6 7 8",
		"```",
		"",
		"Place resources from your inventory into grid slots and craft the target item.",
		"",
		"Use the tools to actually craft it — do not just describe the steps in text.",
	].join("\n");
}

const TOOL_DESCRIPTION = [
	"## Tools",
	"",
	"You have four crafting tools:",
	"",
	"- `place(item, slot)` — place an item from your inventory into a grid slot (0-8).",
	"- `take(slot)` — take the item in a grid slot back into your inventory.",
	"- `clear()` — return all items on the grid to your inventory.",
	"- `craft()` — craft whatever the current grid forms, if anything.",
	"",
	"**Feedback contract:** every action — place, take, clear, craft, including failed",
	"ones — tells you whether your current grid is craftable and what it would produce,",
	"along with the full grid and inventory. Use that feedback to guide your search.",
].join("\n");

const TEACHING_PHASE = [
	"## Teaching phase",
	"",
	"You solved it. Write a reusable skill file at `skill.md` that teaches another",
	"agent to handle challenges like this one.",
	"",
	"The file MUST start with YAML frontmatter containing `name` and `description`",
	"fields (the skill loader rejects files without it):",
	"",
	"```",
	"---",
	"name: my-skill",
	"description: How to search a crafting grid with feedback",
	"---",
	"```",
	"",
	"Skill rubric — procedures and strategies beat answers: how to search, how to read",
	"the feedback, pruning heuristics. Worked examples are allowed and encouraged.",
	"",
	"The student will face a DIFFERENT but related task (different items, different",
	"recipe). Say explicitly which parts of your strategy generalize (search order,",
	"feedback reading, pruning, inventory budgeting) and which are specific to this",
	"instance. If your solution chained multiple crafts (intermediates), explain how:",
	"craft the intermediate, note that wouldProduce can be a non-target output, then",
	"use that output in the next pattern.",
	"",
	"Alongside the specifics of what you did, include your general observations about",
	"how this kind of crafting table behaves — patterns in the items, the recipes, or",
	"the feedback — that would help an agent succeed on related challenges even",
	"without having seen this exact one.",
	"No hidden-channel hints.",
].join("\n");

function conditionInjection(
	condition: StudentCondition,
	files: ConditionFiles,
): string {
	if (condition === "none") return "";
	if (condition === "transcript") {
		return [
			"## Additional material",
			"",
			`an agent previously worked on a related problem; this is its raw transcript: ${files.transcriptPath}`,
		].join("\n");
	}
	return [
		"## Additional material",
		"",
		`a previous agent distilled its experience into this skill: ${files.skillPath}`,
	].join("\n");
}

export function renderTeacherPrompt(scenario: Scenario): string {
	return [taskStatement(scenario), TOOL_DESCRIPTION, TEACHING_PHASE].join(
		"\n\n",
	);
}

export function renderStudentPrompt(
	scenario: Scenario,
	condition: StudentCondition,
	files: ConditionFiles = {},
): string {
	return [
		taskStatement(scenario),
		TOOL_DESCRIPTION,
		conditionInjection(condition, files),
	]
		.filter(Boolean)
		.join("\n\n");
}
