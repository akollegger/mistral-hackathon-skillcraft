# @skillcraft/playback (stretch, plan P6)

Event-log replayer; mocked crafting table UI. Fully parallel, never on the critical path.

- Consumes `events.jsonl` only (never live agent state), via @skillcraft/contracts schemas.
- Aesthetic: concrete pixel-art Minecraft reference given to Vibe CLI at the event; grid,
  inventory strip, step/scrub controls, craftable feedback rendering.
- Kill criterion: zero core time; partial = replaying one teacher run + one student run.
