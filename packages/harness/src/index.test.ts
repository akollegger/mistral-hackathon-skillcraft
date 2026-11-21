import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventedBook, inventedScenario } from "@skillcraft/world";
import { describe, expect, it } from "vitest";
import {
	assertNoMcpConfigInDir,
	assertRelatePortsClosed,
	installSkill,
	makeRunDir,
	runSpecOf,
	validateSkillFrontmatter,
} from "./index.js";

describe("runSpecOf", () => {
	it("serializes scenario inventory Map to entries for the MCP server", () => {
		const spec = runSpecOf(inventedScenario, inventedBook);
		expect(spec.scenario.inventory).toEqual([
			["invented:foo", 2],
			["invented:meh", 1],
			["invented:fiz", 3],
		]);
		expect(spec.book).toHaveLength(2);
		expect(() => JSON.parse(JSON.stringify(spec))).not.toThrow();
	});
});

describe("validateSkillFrontmatter (S5 gate)", () => {
	it("accepts frontmatter with name + description and returns the name", () => {
		const gate = validateSkillFrontmatter(
			"---\nname: craft-search\ndescription: how to search\n---\n# body",
		);
		expect(gate).toEqual({ ok: true, name: "craft-search" });
	});
	it("rejects missing frontmatter or missing fields", () => {
		expect(validateSkillFrontmatter("# no frontmatter").ok).toBe(false);
		expect(validateSkillFrontmatter("---\nname: x\n---").ok).toBe(false); // no description
	});
});

describe("installSkill", () => {
	it("installs to .agents/skills/<name>/SKILL.md and dir/skill.md; rejects non-compliant skills", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-dir-"));
		const content = "---\nname: craft-search\ndescription: d\n---\nbody";
		installSkill(dir, content);
		expect(
			readFileSync(join(dir, ".agents/skills/craft-search/SKILL.md"), "utf8"),
		).toBe(content);
		expect(readFileSync(join(dir, "skill.md"), "utf8")).toBe(content);
		expect(() => installSkill(dir, "no frontmatter")).toThrow(/rejected/);
	});
});

describe("makeRunDir", () => {
	it("creates results/runs/<runId>/dir/work layout", () => {
		const { runDir, dir } = makeRunDir("test-run-id");
		expect(existsSync(join(dir, "work"))).toBe(true);
		expect(runDir).toContain(join("results", "runs", "test-run-id"));
		// cleanup
		rmSync(join(process.cwd(), "results"), { recursive: true, force: true });
	});
});

describe("anti-cheat guards", () => {
	it("assertNoMcpConfigInDir passes on a clean dir, throws on MCP config", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillcraft-clean-"));
		expect(() => assertNoMcpConfigInDir(dir)).not.toThrow();
		writeFileSync(join(dir, ".vibe"), "mcp_servers = []");
		expect(() => assertNoMcpConfigInDir(dir)).toThrow(/anti-cheat/);
	});

	it("assertRelatePortsClosed resolves when 7474/7475 are closed", async () => {
		await expect(assertRelatePortsClosed()).resolves.toBeUndefined();
	});
});

describe("demo-matrix prompt selection", () => {
	it("teacher+skill cells get the student prompt shape (no teaching phase), teacher-none gets the teaching phase", async () => {
		const { renderTeacherPrompt, renderStudentPrompt } = await import(
			"./prompts.js"
		);
		const { TAUGHT_CELLS, CELLS, TARGETS } = await import("./grid.js");
		const cell = TAUGHT_CELLS[0]!;
		// mirrors spawnRun's selection: role=teacher && condition=null -> teacher prompt
		const teacherNone = renderTeacherPrompt(cell.scenario);
		const teacherSkill = renderStudentPrompt(cell.scenario, "skill", {
			skillPath: "skill.md",
		});
		expect(teacherNone).toContain("Teaching phase");
		expect(teacherSkill).not.toContain("Teaching phase");
		expect(teacherSkill).toContain(
			"a previous agent distilled its experience into this skill: skill.md",
		);
		expect(CELLS.length).toBe(5);
		expect(TARGETS["inv-qux-heldout"]).toBe("invented:qux");
	});
});
