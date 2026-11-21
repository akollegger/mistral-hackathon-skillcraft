# Scenario model — recipes as composable functions (actual-Minecraft seed)

## Model ruling (locked design)

A **Recipe is a function**: fixed item types at exact grid locations (the pattern)
→ a produced quantity of the target item. Composition comes from recipes whose
inputs are other recipes' outputs. This replaces the flat acceptedPatterns model.

```
Recipe(pattern: 3x3 grid of item|null,
       equivalence: exact | shapeless | rotation_mirror,
       produces: quantity of targetItem)
```

- **exact**: item-slots must match the pattern cell-for-cell (sticks, torch, fence).
- **shapeless**: pattern ignored, only ingredient types+counts match (log → planks).
  Modeled as `null`-wildcard single-slot in the seed data; engine treats matching as
  count-based.
- **rotation_mirror**: pattern matches under rotations/reflections (reserved for
  traditional tier equivalence; e.g. any plank type groups, rotations of shaped tools).
- **translate** (added for the derived stool): pattern matches anywhere in the grid
  with the same shape; seat = 3 planks in any row. Translations illegal under exact.

Consequences for the craft engine (event-day `packages/world`):

- Dataset FILES (`contracts/scenario.ts`) keep the readable 3x3 array form
  (`GridPattern`); the 9-char template is its graph projection, computed by the
  harness when creating post-hoc Recipe nodes.
- `wouldProduce` must do **per-location shape matching**, not multiset matching
  (S2's server was intentionally multiset-loose; that ruling is superseded).
- `craft` consumes placed per-pattern inputs and credits `produces` quantity:
  `inventory[targetItem] += produces`.
- New metric: **leftover inventory** and **composition depth** reached
  (how many recipe applications from raw inputs to target).

## Composition depth = the tier semantics

| Tier        | Depth | Seeds from actual Minecraft                                                                                                                                                                                                                       |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| traditional | 1-3   | canonical recipes only: torch, pickaxe; composed chains of REAL recipes such as fence-from-logs (log→planks→sticks→fence). Familiarity is the tier, not depth                                                                                     |
| derived     | 2-4   | plausible but NOT canonical: **wooden stool from logs** — seat = 3 planks in any row (translate equivalence; new item), stool = seat + 3 sticks in a row (legs); quantity budgeting across 4 recipe applications, partial-credit rules documented |
| invented    | 2-3   | same compositional engine, invented items/recipes defined by us (hidden held-out book) — search tier                                                                                                                                              |

## Actual-Minecraft seed recipes (verified 2026-11-21)

| recipe            | pattern (3x3, `.` = empty)                                                     | produces | notes                                                          |
| ----------------- | ------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| oak_planks        | `[oak_log, ., .; ., ., .; ., ., .]` (shapeless, 1 slot)                        | x4       | any log → matching planks                                      |
| stick             | `[oak_planks, ., .; oak_planks, ., .; ., ., .]` (any 2 planks, exact vertical) | x4       | 1x2 shape anywhere vertical                                    |
| torch             | `[coal, ., .; stick, ., .; ., ., .]`                                           | x4       | coal above stick                                               |
| crafting_table    | `[p, p, .; p, p, .; ., ., .]`                                                  | x1       | 2x2 anywhere                                                   |
| oak_fence         | `[p, s, p; p, s, p; ., ., .]`                                                  | x3       | **changed recipe** (4 planks + 2 sticks), modern 2-row pattern |
| ladder (optional) | `s, ., s / s, ., s / s, ., s` (7 sticks)                                       | x3       | verify at event if used                                        |

Sources: planks/stick ([1337wiki](https://minecraft.1337wiki.com/planks/), [howtocraft](https://howtocraft.net/minecraft/stick)),
fence current pattern ([digminecraft](https://www.digminecraft.com/basic_recipes/make_oak_fence.php)),
general ([fandom crafting recipes](https://minecraft-archive.fandom.com/wiki/Crafting_Recipes)).

## Seed scenario: fence-from-logs (the canonical derived-tier walkthrough)

Raw inventory: `oak_log x2, coal x1` (coal unused; distractor + torch option).
Hidden book: log→planks(4), planks→stick(4), fence(3).
Solving requires >= 3 recipe applications and quantity budgeting:
`2 logs → 8 planks; 2 planks → 4 sticks; 4 planks + 2 sticks → 3 fences`
(ends with 2 planks + 2 sticks leftover; wrong budgeting strands the agent).

## Graph storage shape (extends graph-schema.cypher)

Design ruling (2026-11-21): **shape is an encoded property, not topology.**
Per-slot REQUIRES edges were rejected: they explode into one edge per occupied cell
AND lose the shape-as-a-whole (geometry isn't recoverable for rotation/mirror
matching without reassembling it in the query).

```cypher
(Recipe {recipeId, targetItem, tier, equivalence,
         produces,               // quantity output
         shape})                 // 9-char template, one char per 3x3 cell, "." = empty
(Recipe)-[:REQUIRES {quantity, var}]->(Item)   // ONE edge per ingredient type; var binds into shape
(Recipe)-[:PRODUCES {quantity}]->(Item)
(Book)-[:CONTAINS]->(Recipe)
(Task)-[:TESTS]->(Recipe)
```

Examples: stick `shape: "A.A.A....", var A = planks`; fence `"ASA.ASA.."` with
A=planks, S=stick; log→planks shapeless → `shape: null` (counts only).

- Equivalence = string algebra on the template (rotation/mirror = char permutation),
  precomputed by the harness into a variants set; no graph joins.
- Shapeless = `shape: null` + `quantity` on REQUIRES edges. Graceful degradation.
- DAG metrics (depth, chains, lift) run purely on REQUIRES/PRODUCES edges.
- Anti-cheat rule 5 unchanged: `shape` enters the graph post-hoc only; during runs
  templates live in harness-internal JSON.

REJECTED alternatives: shared `(:Shape)` nodes (an extra join no judge query needs;
revisit only if "recipes sharing a shape" becomes a real query), and per-slot
`:AT {index}` edges (edge braid plus reassembly for equivalence matching).
