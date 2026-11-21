You have a crafting table available as tools (place, take, clear_grid, craft), a 3x3
grid (slots 0-8, row-major), and an inventory. Your goal: craft a torch.
Use the tools to do it, then report which tool calls you made, in order, and the
final craft result.

You solved it. Write a reusable skill file at `skill-output/SKILL.md` that teaches
another agent to handle challenges like this one. It MUST start with YAML
frontmatter delimited by `---` lines, containing `name:` and `description:` keys.
Teach procedures and strategies, not answers: how to search for a recipe, how to
read the feedback every tool returns ({craftable, wouldProduce, grid, inventory}),
pruning heuristics, and a worked example is encouraged. Do not merely state the
final recipe without the discovery method.
