/** Relate lineage types (spec level). Mirrors docs/graph-schema.cypher. */
import { z } from "zod";

export const RunRole = z.enum(["teacher", "student"]);
export const Condition = z.enum(["none", "transcript", "skill"]).nullable();

export const GraphRun = z.object({
  runId: z.string().uuid(),
  role: RunRole,
  condition: Condition,
  taskId: z.string(),
  tier: z.enum(["traditional", "derived", "invented"]),
  heldOut: z.boolean(),
  outcome: z.enum(["success", "fail", "timeout"]),
  toolCalls: z.number().int(),
  failedAttempts: z.number().int(),
  durationMs: z.number().int(),
});

export const GraphSkill = z.object({
  skillId: z.string().uuid(),
  generatedByRunId: z.string().uuid(),
  classification: z.enum(["procedure", "answer", "unknown"]),
  exampleCount: z.number().int(),
});

export const GraphEval = z.object({
  runId: z.string().uuid(),
  metric: z.enum(["success", "toolCalls", "failedAttempts", "durationMs"]),
  value: z.number(),
});
