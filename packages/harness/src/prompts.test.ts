import { inventedScenario, stoolFromLogsScenario } from "@skillcraft/world";
import { describe, expect, it } from "vitest";
import { renderStudentPrompt, renderTeacherPrompt } from "./prompts.js";

describe("prompt templates (docs/harness-protocol.md shapes)", () => {
	it("teacher prompt: task + tools + teaching phase with frontmatter mandate and rubric", () => {
		const p = renderTeacherPrompt(inventedScenario);
		expect(p).toContain("invented:bar");
		expect(p).toContain("invented:foo x2");
		expect(p).toContain("0 1 2");
		expect(p).toContain("Feedback contract");
		expect(p).toContain("skill.md");
		expect(p).toContain("name:");
		expect(p).toContain("description:");
		expect(p).toContain("procedures and strategies beat answers");
		expect(p).not.toContain("transcript");
	});

	it("student prompt is identical minus teaching, condition none adds nothing", () => {
		const teacher = renderTeacherPrompt(stoolFromLogsScenario);
		const student = renderStudentPrompt(stoolFromLogsScenario, "none");
		expect(student).toContain("derived:wooden_stool");
		expect(student).toContain("Feedback contract");
		expect(student).not.toContain("Teaching phase");
		expect(student).not.toContain("skill.md");
		// shared sections identical
		expect(student.split("## Tools")[0]).toBe(teacher.split("## Tools")[0]);
	});

	it("transcript condition injects verbatim phrasing with the path", () => {
		const p = renderStudentPrompt(inventedScenario, "transcript", {
			transcriptPath: "transcript.md",
		});
		expect(p).toContain(
			"an agent previously worked on a related problem; this is its raw transcript: transcript.md",
		);
	});

	it("skill condition injects verbatim phrasing with the path", () => {
		const p = renderStudentPrompt(inventedScenario, "skill", {
			skillPath: "skill.md",
		});
		expect(p).toContain(
			"a previous agent distilled its experience into this skill: skill.md",
		);
	});
});
