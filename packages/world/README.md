# @skillcraft/world

Crafting world model: 3x3 grid state, inventory, hidden recipe books, pattern matching
(rotation/mirror equivalence), feedback generation per contracts/tool.ts.

EVENT: implement from scratch inside the event clock. Unit tests are the priority: the
feedback contract and equivalence rules get vitest coverage before any agent runs.

Entry (planned): `evaluate(action: ToolCall, state: WorldState): ToolFeedback` and
`craft(state): CraftResult`. Schemas it must honor live in @skillcraft/contracts.
