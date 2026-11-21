# @skillcraft/playback (stretch, plan P6)

Event-log replayer; mocked crafting table UI. Fully parallel, never on the critical path.

- Consumes `events.jsonl` only (never live agent state), via `@skillcraft/contracts` schemas.
- Lofi pixel-art UI: 32×32 procedurally painted sprites, chunky beveled borders, Mistral
  gradient accents (`#FFD800 → #E10500`). No image assets, no UI framework — Vite + vanilla TS.
- Aesthetic: concrete pixel-art Minecraft reference given to Vibe CLI at the event; grid,
  inventory strip, step/scrub controls, craftable feedback rendering.

## Run it

```sh
pnpm --filter @skillcraft/playback dev      # http://localhost:5173
pnpm --filter @skillcraft/playback build    # static bundle in dist/ (base "./", hostable anywhere)
pnpm --filter @skillcraft/playback test     # replayer core + demo-fixture tests
pnpm --filter @skillcraft/playback typecheck
```

Fixed pair layout: **teacher left, student right** (student pane may stay empty — it shows a
drop hint until a run is loaded). Load runs via the file pickers or by dropping files anywhere
on the page (first file → teacher, second → student). Buttons load the bundled demo runs
(`public/demo/teacher.events.jsonl`, `student.events.jsonl`).

Each pane: 3×3 crafting grid, craftable feedback slot (green = craftable, red = not), inventory
strip, transport (⏮ ◀ ▶ ▶| ⏭, scrub slider, 0.5–4× speed), and a clickable event list.

## Notes

- Per-kind payload narrowing lives in `src/replayer.ts` (playback-local). The contract's
  `Inventory` is a zod `z.map`, which cannot round-trip through JSON; the replayer accepts a
  record or entry-pairs and normalizes to a `Map`.
- Imports use `@skillcraft/contracts/tool` / `/event-log` subpaths because the package barrel
  has a pre-existing ambiguous `Condition` re-export (fails `tsc`).
- Sync with main: this package is additive and depends only on the contracts schemas;
  `git merge main` into the feature branch after upstream changes.
