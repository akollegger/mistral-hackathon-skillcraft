#!/usr/bin/env node
import { readFileSync } from "node:fs";
/** Skillcraft craft-tools MCP server (stdio, newline-delimited JSON-RPC).
 *
 *  One server process = one run: it owns a single @skillcraft/world World
 *  seeded from a run-spec JSON file (env SKILLCRAFT_RUN_SPEC) containing
 *  { scenario, book } with scenario.inventory as [itemId, qty] entries.
 *
 *  Modeled on spikes/s2/server.mjs, but matching is done by @skillcraft/world
 *  (per-location shape matching per docs/scenario-model.md — S2's
 *  multiset-loose matcher is superseded). Server name is "skillcraft", so
 *  vibe reports toolNames namespaced as mcp_skillcraft_<tool> (S6 ruling).
 *
 *  Feedback contract (frozen, contracts/tool.ts): EVERY tool result —
 *  including errors — carries { craftable, wouldProduce, grid, inventory }.
 */
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import type { Scenario as ScenarioS } from "@skillcraft/contracts/scenario";
import { ToolCall } from "@skillcraft/contracts/tool";
import { type Book, type Feedback, World } from "@skillcraft/world";
import type { z } from "zod";

type Scenario = z.infer<typeof ScenarioS>;

export interface RunSpec {
	scenario: Omit<Scenario, "inventory"> & { inventory: [string, number][] };
	book: Book;
}

export function loadRunSpec(specPath: string): RunSpec {
	return JSON.parse(readFileSync(specPath, "utf8")) as RunSpec;
}

/** Serialized feedback as it goes over JSON-RPC (inventory Map -> plain object). */
export interface SerializedFeedback {
	craftable: boolean;
	wouldProduce: string | null;
	grid: (string | null)[][];
	inventory: Record<string, number>;
}

function serialize(fb: Feedback): SerializedFeedback {
	return {
		craftable: fb.craftable,
		wouldProduce: fb.wouldProduce,
		grid: fb.grid.map((row) => [...row]),
		inventory: Object.fromEntries(fb.inventory),
	};
}

export type CallResult = SerializedFeedback & {
	error?: string;
	success?: boolean;
	produced?: string | null;
};

export const TOOLS = [
	{
		name: "place",
		description:
			"Place ITEM from the inventory into grid SLOT (0-8, row-major 3x3). Returns whether the grid is now craftable and what it would produce, plus full grid and inventory.",
		inputSchema: {
			type: "object",
			properties: {
				item: { type: "string" },
				slot: { type: "integer", minimum: 0, maximum: 8 },
			},
			required: ["item", "slot"],
		},
	},
	{
		name: "take",
		description:
			"Take the resource back from grid SLOT into the inventory. Returns updated grid, craftability, and inventory.",
		inputSchema: {
			type: "object",
			properties: { slot: { type: "integer", minimum: 0, maximum: 8 } },
			required: ["slot"],
		},
	},
	{
		name: "clear",
		description:
			"Return all placed resources on the grid to the inventory. Returns updated grid, craftability, and inventory.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "craft",
		description:
			"Craft the item the grid currently forms. Fails (with full feedback) if the grid is not craftable; on success consumes the pattern and credits the produced quantity.",
		inputSchema: { type: "object", properties: {} },
	},
];

/** One server instance = one run = one World. */
export function createServer(spec: RunSpec) {
	const scenario: Scenario = {
		...spec.scenario,
		inventory: new Map(spec.scenario.inventory),
	};
	const world = new World(scenario, spec.book);

	function callTool(
		name: string,
		rawArgs: Record<string, unknown>,
	): CallResult {
		const parsed = ToolCall.safeParse({ op: name, ...rawArgs });
		if (!parsed.success) {
			// Invalid call still carries full feedback (frozen contract: errors included).
			return {
				...serialize(world.state),
				error: `invalid arguments for ${name}: ${parsed.error.message}`,
			};
		}
		try {
			switch (parsed.data.op) {
				case "place":
					return serialize(world.place(parsed.data.item, parsed.data.slot));
				case "take":
					return serialize(world.take(parsed.data.slot));
				case "clear":
					return serialize(world.clear());
				case "craft": {
					const res = world.craft();
					return {
						...serialize(res.feedback),
						success: res.success,
						produced: res.produced,
					};
				}
			}
		} catch (e) {
			const err = e as Error & { feedback?: Feedback };
			const fb = err.feedback ?? world.state;
			return { ...serialize(fb), error: err.message };
		}
	}

	/** Handle one JSON-RPC message; returns the response object, or null for notifications. */
	function handle(msg: {
		id?: number | string;
		method?: string;
		params?: Record<string, unknown>;
	}) {
		const { id, method } = msg;
		if (method === "initialize") {
			return {
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion:
						(msg.params?.protocolVersion as string) ?? "2025-03-26",
					capabilities: { tools: {} },
					serverInfo: { name: "skillcraft", version: "0.1.0" },
				},
			};
		}
		if (method === "notifications/initialized" || method === "initialized")
			return null;
		if (method === "tools/list")
			return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
		if (method === "tools/call") {
			const params = msg.params as {
				name: string;
				arguments?: Record<string, unknown>;
			};
			const result = callTool(params.name, params.arguments ?? {});
			return {
				jsonrpc: "2.0",
				id,
				result: {
					content: [{ type: "text", text: JSON.stringify(result) }],
					isError: "error" in result,
				},
			};
		}
		if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
		if (id !== undefined) {
			return {
				jsonrpc: "2.0",
				id,
				error: { code: -32601, message: `method not found: ${method}` },
			};
		}
		return null;
	}

	return { world, callTool, handle };
}

// --- stdio loop, only when executed directly (not imported by tests) ---
const isMain =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	const specPath = process.env.SKILLCRAFT_RUN_SPEC;
	if (!specPath) {
		console.error(
			"SKILLCRAFT_RUN_SPEC env var required (path to run-spec JSON)",
		);
		process.exit(1);
	}
	const server = createServer(loadRunSpec(specPath));
	const rl = readline.createInterface({ input: process.stdin });
	const send = (obj: unknown) =>
		process.stdout.write(JSON.stringify(obj) + "\n");
	rl.on("line", (line) => {
		if (!line.trim()) return;
		let msg: {
			id?: number | string;
			method?: string;
			params?: Record<string, unknown>;
		};
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}
		const res = server.handle(msg);
		if (res !== null) send(res);
	});
}
