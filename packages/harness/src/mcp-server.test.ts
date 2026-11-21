import { inventedBook, inventedScenario } from "@skillcraft/world";
import { describe, expect, it } from "vitest";
import { createServer, type RunSpec } from "./mcp-server.js";

const spec: RunSpec = {
	scenario: {
		...inventedScenario,
		inventory: [...inventedScenario.inventory.entries()],
	},
	book: inventedBook,
};

type Response = {
	id?: number | string;
	result?: {
		content?: { text: string }[];
		isError?: boolean;
		tools?: { name: string }[];
	};
	error?: { message: string };
};

const call = (
	server: ReturnType<typeof createServer>,
	id: number,
	name: string,
	args: Record<string, unknown>,
) => {
	const res = server.handle({
		id,
		method: "tools/call",
		params: { name, arguments: args },
	}) as Response;
	return {
		res,
		payload: JSON.parse(res.result!.content![0]!.text) as Record<
			string,
			unknown
		>,
	};
};

describe("craft MCP server (stdio JSON-RPC handler)", () => {
	it("refuses calls beyond the tool-call budget with full feedback", () => {
		const server = createServer(spec, 3);
		call(server, 1, "clear", {});
		call(server, 2, "clear", {});
		call(server, 3, "clear", {});
		const { payload } = call(server, 4, "clear", {});
		expect(payload.error).toMatch(/budget exhausted/);
		expect(payload).toHaveProperty("craftable");
		expect(payload).toHaveProperty("inventory");
	});

	it("initialize advertises server name 'skillcraft' (namespacing root for mcp_skillcraft_*)", () => {
		const server = createServer(spec);
		const res = server.handle({
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2025-03-26" },
		}) as {
			result: { serverInfo: { name: string } };
		};
		expect(res.result.serverInfo.name).toBe("skillcraft");
	});

	it("tools/list exposes the contract grammar: place/take/clear/craft", () => {
		const server = createServer(spec);
		const res = server.handle({ id: 2, method: "tools/list" }) as Response;
		expect(res.result!.tools!.map((t) => t.name).sort()).toEqual([
			"clear",
			"craft",
			"place",
			"take",
		]);
	});

	it("full invented-tier flow: place foo/meh/fiz -> craftable bar -> craft credits 2 bars", () => {
		const server = createServer(spec);
		let r = call(server, 3, "place", { item: "invented:foo", slot: 0 });
		expect(r.payload.craftable).toBe(false);
		expect(r.payload.wouldProduce).toBe(null);
		expect(r.payload.inventory).toMatchObject({ "invented:foo": 1 });
		r = call(server, 4, "place", { item: "invented:meh", slot: 3 });
		r = call(server, 5, "place", { item: "invented:fiz", slot: 6 });
		expect(r.payload.craftable).toBe(true);
		expect(r.payload.wouldProduce).toBe("invented:bar");
		r = call(server, 6, "craft", {});
		expect(r.res.result!.isError).toBe(false);
		expect(r.payload.success).toBe(true);
		expect(r.payload.produced).toBe("invented:bar");
		expect(r.payload.inventory).toMatchObject({
			"invented:bar": 2,
			"invented:fiz": 2,
		});
	});

	it("errors carry the full feedback object (frozen contract) and set isError", () => {
		const server = createServer(spec);
		const r = call(server, 7, "place", { item: "invented:bar", slot: 0 }); // not in inventory
		expect(r.res.result!.isError).toBe(true);
		expect(r.payload.error).toMatch(/No invented:bar/);
		expect(r.payload).toHaveProperty("craftable", false);
		expect(r.payload).toHaveProperty("wouldProduce", null);
		expect(r.payload).toHaveProperty("grid");
		expect(r.payload).toHaveProperty("inventory");
		// invalid args also carry feedback
		const bad = call(server, 8, "place", { item: "invented:foo" }); // missing slot
		expect(bad.res.result!.isError).toBe(true);
		expect(bad.payload).toHaveProperty("inventory");
	});

	it("take/clear recover resources with feedback", () => {
		const server = createServer(spec);
		call(server, 9, "place", { item: "invented:foo", slot: 0 });
		const t = call(server, 10, "take", { slot: 0 });
		expect(t.payload.inventory).toMatchObject({ "invented:foo": 2 });
		call(server, 11, "place", { item: "invented:fiz", slot: 1 });
		const c = call(server, 12, "clear", {});
		expect(c.payload.grid).toEqual([
			[null, null, null],
			[null, null, null],
			[null, null, null],
		]);
		expect(c.payload.inventory).toMatchObject({ "invented:fiz": 3 });
	});

	it("craft on a non-craftable grid fails with feedback", () => {
		const server = createServer(spec);
		const r = call(server, 13, "craft", {});
		expect(r.res.result!.isError).toBe(true);
		expect(r.payload.error).toMatch(/not craftable/);
		expect(r.payload).toHaveProperty("craftable", false);
	});
});
