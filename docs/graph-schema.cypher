-- Skillcraft Relate graph schema (spec; write at event after spike S3 confirms driver path)
-- Model mirrors packages/contracts/src/graph-plan and the brief's architecture diagram.

-- Node keys
CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.taskId IS UNIQUE;
CREATE CONSTRAINT run_id IF NOT EXISTS FOR (r:Run) REQUIRE r.runId IS UNIQUE;
CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.skillId IS UNIQUE;

-- Core lineage (matches contracts):
--   (TeacherRun)-[:GENERATED]->(Skill)-[:USED_IN]->(StudentRun)
--   (Run)-[:ATTEMPTED]->(Task)         (student runs re-use the same task nodes)
--   (Run)-[:SCORED_BY]->(Eval {metric, value})
-- Eval queries that must reduce to one Cypher each:
--   skill lift:     MATCH (s:Run)-[:USED_IN]->()<-[:GENERATED]-(t:Run {role:'teacher'})
--                   ... vs s without skill; per tier, taught vs heldOut
--   sample eff:     student success rate bucketed by Skill.exampleCount
--   strategy qual:  avg(Run.toolCalls), avg(Run.failedAttempts) per condition
-- Kill criterion (plan P2): if Relate write path exceeds 90 min, JSON lines remain
-- the source of truth and this graph is rebuilt post-hoc from logs.

// S3 spike rulings (2026-11-20):
// - avg() booleans need a numeric cast: avg(CASE WHEN r.success THEN 1.0 ELSE 0.0 END)
// - Constraints: CREATE CONSTRAINT ... IS UNIQUE supported on Task.id, Run.id, Skill.id
// - Params ($x) supported on the in-process Node client; kept parameterized throughout.

-- Dataset half (2026-11-21 recipe-as-function ruling; see docs/scenario-model.md):
(Item   {itemId})
-- SHAPE IS AN ENCODED PROPERTY, NOT TOPOLOGY (no per-slot edges):
(Recipe {recipeId, tier, targetItem, equivalence, produces,
         shape})         -- 9-char template, one char per 3x3 cell, "." empty; post-hoc only (anti-cheat 5)
(Recipe)-[:REQUIRES {quantity, var}]->(Item)   -- ONE edge per ingredient TYPE; var binds into shape
(Recipe)-[:PRODUCES {quantity}]->(Item)
(Book)-[:CONTAINS]->(Recipe)
(Task)-[:TESTS]->(Recipe)
-- REQUIRES/PRODUCES keep the recipe graph a DAG: composition depth per task is
-- one query: MATCH path = (raw:Item)<-[:REQUIRES*]-(r:Recipe)-[:PRODUCES]->(target)
-- Equivalence (rotation/mirror) = string permutation of the 9-char template,
-- precomputed by the harness; shapeless = shape:null + quantity only.
-- Judge-query impact: strategy quality unchanged; sample efficiency additionally
-- buckets by composition depth; leftover inventory becomes a scored metric.
