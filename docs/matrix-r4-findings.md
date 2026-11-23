# Matrix round 4 findings (P6 adaptive, n up to 30/cell)

208 runs total (5 teacher-none + 5 teacher+skill + 192 adaptive student + 6 backfilled teacher-none on held-out).
Student success per cell x condition (Wilson 95% CI):

| Cell | none | transcript | skill |
|---|---|---|---|
| trad-pickaxe-1 | — | — | — |
| trad-fence-1 | 20/30 (67%, CI 0.49–0.81, 52 calls) | 21/30 (70%, CI 0.52–0.83, 45 calls) | 16/30 (53%, CI 0.36–0.70, 56 calls) |
| der-stool-1 | 2/6 (33%, CI 0.10–0.70, 88 calls) | 6/6 (100%, CI 0.61–1.00, 20 calls) | 6/6 (100%, CI 0.61–1.00, 17 calls) |
| inv-bar-1 | 5/30 (17%, CI 0.07–0.34, 83 calls) | 5/6 (83%, CI 0.44–0.97, 17 calls) | 6/6 (100%, CI 0.61–1.00, 4 calls) |
| inv-qux-heldout | 0/6 (0%, CI 0.00–0.39, 86 calls) | 13/30 (43%, CI 0.27–0.61, 69 calls) | 0/6 (0%, CI 0.00–0.39, 79 calls) |

## Findings

- **Skill lift on taught non-trivial cells is large and now well-measured:** stool none 2/6 vs skill 6/6 (17 calls), bar none 5/30 vs skill 6/6 (4 calls).
- **No skill lift on held-out fence (16/30 vs none 20/30); qux-heldout fails cold (0/6 none, 0/6 skill, transcript 13/30).** Teacher-cold backfill: fence 3/3 (~49 calls), qux 1/3 (~200 calls, two timeouts) — the large model also struggles cold on qux.
- **Failure reasons (A4):** student failures are dominated by tool-call budget exhaustion at the 80-call cap (see `failureBreakdown`), not wrong recipes.
- Transcript beats skill on held-out qux (43% vs 0%) — raw trajectory transfers better than the distilled skill there; a distillation-quality signal.

## Limitations (CODE-REVIEW B-items, carried forward)

- B2: one task per tier — tier effects are confounded with task quirks.
- B3: pickaxe (depth 1) vs fence (depth 3) are NOT a matched held-out pair; the trad pair tests depth+procedure transfer jointly. bar/qux are matched.
- B5: teacher cells use mistral-large-4-0 with a 200-call cap; students use mistral-medium-latest with 80 — model and budget are confounded with role.
- B8: taught student cells replay the exact scenario the skill was written for — a recall control, not pure distillation transfer.
- A2 note: rounds 3–4 ran with unscoped books (held-out recipe discoverable via wouldProduce); fixed from round 5 on (scoped `*BookTaught`).
- A1 note: fence run metas from rounds 3–4 were mislabelled heldOut=false on disk; corrected post-hoc (95 files + lineage).
