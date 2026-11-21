/** Skillcraft scenarios + experiment grid (spec level).
 *  Scenario DATASETS (recipe books, inventories) are event-day artifacts;
 *  types here freeze the experiment design from the brief/plan.
 *  2026-11-21 ruling: recipes are FUNCTIONS — pattern at locations, produced
 *  quantity, composable chains. See docs/scenario-model.md. */
import { z } from "zod";
import { ItemId, Quantity } from "./tool.js";

export const Tier = z.enum(["traditional", "derived", "invented"]);

/** 3x3 grid of item-or-empty at exact locations (row-major). */
export const GridPattern = z.array(z.array(ItemId.nullable())).length(3);

export const Equivalence = z.enum(["exact", "shapeless", "rotation_mirror"]);

export const Recipe = z.object({
  recipeId: z.string(),
  tier: Tier,
  targetItem: ItemId,
  /** Function output: how many of targetItem one craft produces. */
  produces: Quantity, // e.g. planks x4, sticks x4, fence x3
  /** Function input: exact locations in the 3x3 (".": null). */
  pattern: GridPattern,
  equivalence: Equivalence, // shapeless matches counts only; exact matches cells
  /** Composition: is this recipe's output an ingredient of other recipes? */
  intermediate: z.boolean(),
  partialCreditRules: z.string().nullable(), // derived tier: documented per scenario
});

/** How many recipe applications from raw inventory to the target. */
export const CompositionDepth = z.number().int().min(1);

export const Scenario = z.object({
  taskId: z.string(),
  tier: Tier,
  targetItem: ItemId,
  /** Raw inputs only; intermediates must be crafted (composition). */
  inventory: z.map(ItemId, Quantity),
  /** Max recipe applications needed; the depth metric the scenario measures. */
  depth: CompositionDepth,
  heldOut: z.boolean(),
  recipeReference: z.string(), // id into hidden book; never serialized to prompts
});

export const Condition = z.enum(["none", "transcript", "skill"]);
export const Reps = z.number().int().min(3); // plan P4: minimum n=3 per cell

/** Skill artifact: teacher-written, copied into fresh student dir. */
export const SkillArtifact = z.object({
  skillId: z.string().uuid(),
  generatedByRunId: z.string().uuid(), // Relate edge: Run -GENERATED-> Skill
  contentHash: z.string(),
  content: z.string(), // markdown, teacher-authored
  classification: z.enum(["procedure", "answer", "unknown"]), // manual 2-min check, P3
  exampleCount: z.number().int(), // sample-efficiency curve input
});
