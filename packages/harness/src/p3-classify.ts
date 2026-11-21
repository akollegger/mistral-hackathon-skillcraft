/** Post-hoc: write final skill classifications into the Relate lineage store. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "./index.js";
import { openLineageStore } from "./relate.js";

const store = openLineageStore(join(RESULTS_DIR, "lineage"));
for (const runId of readdirSync(join(RESULTS_DIR, "runs"))) {
	try {
		const meta = JSON.parse(
			readFileSync(join(RESULTS_DIR, "runs", runId, "skill.meta.json"), "utf8"),
		);
		store.upsertSkill({
			skillId: meta.skillId,
			generatedByRunId: meta.generatedByRunId,
			classification: meta.classification,
			exampleCount: meta.exampleCount,
		});
		console.log(runId, "->", meta.classification);
	} catch {
		/* no skill */
	}
}
store.close();
