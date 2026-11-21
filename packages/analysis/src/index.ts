// EVENT: implement during the clock (plan P5). Stub only.
// Outputs, one judge-ready table each:
//   skillLift()      success with skill vs none, per tier, taught vs held-out
//   sampleEfficiency() success bucketed by skill.exampleCount
//   strategyQuality() avg toolCalls + failedAttempts per tier x condition
//   skillQuality()   student outcome vs teacher skill classification
// Reads events.jsonl logs (source of truth) and/or Relate (plan P2/P5).
export function skillLift(): void {
  throw new Error("EVENT: implement (P5)");
}
