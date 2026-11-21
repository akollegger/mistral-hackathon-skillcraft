/** Skillcraft tool grammar + feedback contract (spec level).
 *  Frozen by brief: every place/take returns craftability + would-produce + full state.
 *  EVENT: implement semantics in packages/world; schemas below are final. */
import { z } from "zod";

export const Slot = z.number().int().min(0).max(8); // 3x3 grid, row-major
export const ItemId = z.string().min(1); // e.g. "minecraft:stick" | "invented:fiz" | "derived:stool"
export const Quantity = z.number().int().positive();

export const Inventory = z.map(ItemId, Quantity);

/** Tool calls. Model-facing grammar; harness routes to world model. */
export const ToolCall = z.discriminatedUnion("op", [
	z.object({ op: z.literal("place"), item: ItemId, slot: Slot }),
	z.object({ op: z.literal("take"), slot: Slot }),
	z.object({ op: z.literal("clear") }),
	z.object({ op: z.literal("craft") }),
]);

/** Feedback contract: returned on EVERY place/take/clear/craft. */
export const ToolFeedback = z.object({
	craftable: z.boolean(),
	wouldProduce: ItemId.nullable(), // null when not craftable
	grid: z.array(z.array(ItemId.nullable())).length(3), // [row][col] item ids (null = empty slot)
	inventory: Inventory,
});

export const CraftResult = z.object({
	success: z.boolean(),
	produced: ItemId.nullable(),
	feedback: ToolFeedback,
});
