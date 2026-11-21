// EVENT: all implementation inside the event clock. Stub only.
import type { ToolCall, ToolFeedback, CraftResult } from "@skillcraft/contracts/tool";

export type WorldState = { grid: unknown; inventory: unknown }; // EVENT: type from contracts
export function evaluate(_call: ToolCall, _state: WorldState): ToolFeedback {
  throw new Error("EVENT: implement (P1)");
}
export function craft(_state: WorldState): CraftResult {
  throw new Error("EVENT: implement (P1)");
}
