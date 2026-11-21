// EVENT: orchestration inside the event clock. Stub only.
// Planned surface (see docs/harness-protocol.md):
//   spawnRun(role, taskId, condition) -> RunMeta   (fresh dir per run, prompt render, events.jsonl)
//   forkDirectory / copySkillIntoStudent / attachTranscript
//   extHttpQuery (Relate write path; fallback JSON lines always on)
export async function spawnRun(): Promise<never> {
  throw new Error("EVENT: implement (P2)");
}
