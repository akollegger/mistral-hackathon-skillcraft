#!/usr/bin/env node
// S2 throwaway: minimal stdio MCP server, zero dependencies.
// Implements the Skillcraft craft tool grammar + feedback contract
// (packages/contracts/src/tool.ts) on a tiny in-memory world.
// Spike questions it answers: can a headless vibe run discover and drive
// these tools? Does state persist across calls within the session?
import readline from "node:readline";

// --- tiny world state (per server process = per run) ---
const grid = Array.from({ length: 3 }, () => Array(3).fill(null)); // row-major
let inventory = { "minecraft:stick": 2, "minecraft:coal": 1 };
const RECIPES = [
  { pattern: [["minecraft:coal", "minecraft:stick"]], produces: "minecraft:torch" },
];
const slots = (g) => g.map((row) => row.slice());

function matchRecipe(g) {
  const flat = g.flat().filter(Boolean);
  for (const r of RECIPES) {
    const need = r.pattern.flat();
    const have = [...flat].sort();
    const want = [...need].sort();
    if (have.length === want.length && have.every((v, i) => v === want[i])) {
      return r.produces;
    }
  }
  return null;
}
function feedback() {
  const produce = matchRecipe(grid);
  return { craftable: produce !== null, wouldProduce: produce, grid: slots(grid), inventory };
}
const TOOLS = [
  {
    name: "place",
    description: "Place ITEM from the inventory into grid SLOT (0-8, row-major 3x3). Returns whether the grid is now craftable and what it would produce.",
    inputSchema: { type: "object", properties: { item: { type: "string" }, slot: { type: "integer", minimum: 0, maximum: 8 } }, required: ["item", "slot"] },
  },
  {
    name: "take",
    description: "Take the resource back from grid SLOT into the inventory. Returns updated grid + craftability.",
    inputSchema: { type: "object", properties: { slot: { type: "integer", minimum: 0, maximum: 8 } }, required: ["slot"] },
  },
  {
    name: "clear_grid",
    description: "Return all placed resources on the grid to the inventory. Returns updated state.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "craft",
    description: "Craft the item the grid currently forms. Fails with feedback if the grid is not craftable.",
    inputSchema: { type: "object", properties: {} },
  },
];

function callTool(name, args) {
  if (name === "place") {
    if (!inventory[args.item]) return { error: `no ${args.item} in inventory` };
    const [r, c] = [Math.floor(args.slot / 3), args.slot % 3];
    if (grid[r][c]) return { error: `slot ${args.slot} occupied (${grid[r][c]})` };
    grid[r][c] = args.item;
    inventory[args.item] -= 1;
    if (inventory[args.item] === 0) delete inventory[args.item];
    return feedback();
  }
  if (name === "take") {
    const [r, c] = [Math.floor(args.slot / 3), args.slot % 3];
    if (!grid[r][c]) return { error: `slot ${args.slot} empty` };
    const item = grid[r][c];
    inventory[item] = (inventory[item] ?? 0) + 1;
    grid[r][c] = null;
    return feedback();
  }
  if (name === "clear_grid") {
    for (const [i, row] of grid.entries()) for (const [j, item] of row.entries()) {
      if (item) { inventory[item] = (inventory[item] ?? 0) + 1; grid[i][j] = null; }
    }
    return feedback();
  }
  if (name === "craft") {
    const fb = feedback();
    if (!fb.craftable) return { ...fb, error: "grid is not craftable" };
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) grid[i][j] = null;
    inventory[fb.wouldProduce] = (inventory[fb.wouldProduce] ?? 0) + 1;
    return { success: true, produced: fb.wouldProduce, ...feedback() };
  }
  return { error: `unknown tool: ${name}` };
}

// --- stdio JSON-RPC loop ---
const rl = readline.createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method } = msg;
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "skillcraft-s6", version: "0.0.1" },
    } });
  } else if (method === "notifications/initialized" || method === "initialized") {
    // notification: no response
  } else if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    const { name, arguments: args } = msg.params ?? {};
    const result = callTool(name, args ?? {});
    const isError = "error" in result;
    send({ jsonrpc: "2.0", id, result: {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError,
    } });
  } else if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  }
});
