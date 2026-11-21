# Skillcraft — Project Pitch

**Do models remember, transfer, or search? A crafting-table evaluation of skill distillation in teacher/student Mistral agent pairs.**

## Summary

Skillcraft measures how AI agents acquire knowledge, using a Minecraft-inspired crafting table as a diagnostic instrument. Given a 3×3 crafting grid and an inventory of resources, a Mistral agent must craft a target item using tool calls: place a resource in a slot, take it back, clear the grid, or craft. The crafting table honors Minecraft's visual feedback contract: every placement or removal tells the agent whether the current grid is craftable, and if so, what it would produce.

Each agent faces three tiers of challenge:

1. **Traditional** (craft a pickaxe): canonical Minecraft recipes. Success comes from facts memorized in training. *This is retrieval.*
2. **Derived** (craft a stool): plausible recipes that are not part of the game. Success requires generalizing from known recipes to unfamiliar but related combinations. *This is transfer.*
3. **Invented** (craft a bar, given quantities of foo, meh, and a fiz): out-of-distribution items made of resources that do not exist. Nothing in training helps; the agent must learn an unknown recipe through exploration and feedback. *This is search.*

The experiment proper is skill distillation: an experienced **teacher** agent solves invented-tier challenges, then writes a reusable **skill** — a portable, human-readable procedure file. That skill is copied into a fresh working directory and given to a naive **student** agent, which faces both the taught task and *held-out* tasks the teacher never saw. We measure whether distilled skills transfer, whether skills transfer better than raw transcripts, and how few examples a student needs.

The result is a quantified answer to a question every team building on LLMs asks: can one agent's hard-won experience be packaged and handed to another — and is that memory, transfer, or search?

## The headline numbers

- **Skill lift:** student success with a distilled skill vs. without, per tier.
- **Sample efficiency:** student success as a function of examples contained in the skill.
- **Strategy quality:** tool calls and failed attempts per successful craft — imitation and memorization cost many blind attempts; genuine strategy transfer costs few.
