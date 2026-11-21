---
name: crafting-table-strategy
description: Teaches agents how to solve Minecraft-style crafting challenges using the crafting table tools (place, take, clear_grid, craft). Focuses on systematic discovery of inventory, recipes, and optimal placement strategies through feedback analysis.
---

# Crafting Table Strategy Guide

This skill teaches you how to systematically solve crafting challenges in a 3x3 grid crafting system. You'll learn to discover your inventory, find valid recipes, and use feedback from each tool call to guide your decisions.

## Core Tools and Their Feedback

Each tool returns structured feedback you must read and act upon:

### `place(item, slot)` → `{craftable, wouldProduce, grid, inventory}`
- Places `item` from inventory into `slot` (0-8, row-major)
- **On success**: Returns current grid state, remaining inventory, and whether the grid is now craftable
- **On failure**: Error reveals if item is not in inventory
- **Key insight**: Use `wouldProduce` to see what the current grid would craft, even before calling `craft()`

### `take(slot)` → `{grid, inventory, craftable, wouldProduce}`
- Returns item from `slot` to inventory
- Use to undo placements and try different configurations

### `clear_grid()` → `{grid, inventory, craftable, wouldProduce}`
- Returns ALL placed items to inventory
- Useful for complete reset when starting over

### `craft()` → `{success, produced, craftable, wouldProduce, grid, inventory}`
- **On success**: Returns the crafted item, clears grid, updates inventory
- **On failure**: Returns `craftable: false` and `wouldProduce: null`, but **crucially reveals your full inventory** in the error

## Discovery Strategy

### Step 1: Inventory Discovery

Your inventory is initially unknown. The fastest way to discover it:

```typescript
const result = await tools.mcp_skillcraft_s6.craft({});
// Even if this fails, the error contains: {inventory: {...}}
```

This single call reveals all items and their counts without modifying state.

**Alternative**: Try placing common items until you find what you have:
```typescript
try {
  await tools.mcp_skillcraft_s6.place({ item: "minecraft:coal", slot: 0 });
} catch (e) {
  // Error message indicates if item is missing
}
```

### Step 2: Recipe Discovery

Once you know your inventory, use systematic placement:

1. **For single-output recipes** (like torch): Place items in the most likely positions first
2. **Use feedback**: After each `place()`, check `wouldProduce` - if it's non-null, you've found a valid recipe
3. **Pruning heuristics**:
   - If placing an item in any slot never produces `craftable: true`, that item is likely not part of the target recipe
   - If you have N of an item and the recipe requires M, you only need to try placing up to M of them
   - Symmetry: Many recipes are vertically or horizontally symmetric, so try center column first

### Step 3: Optimal Placement Order

For a 3x3 grid with row-major slots 0-8:
```
0 1 2
3 4 5
6 7 8
```

**Priority order for placement**:
1. Center (slot 4) - Most recipes use center
2. Top center (slot 1) - Common for items like torches, tools
3. Bottom center (slot 7) - Common for sticks in tools
4. Corners (0, 2, 6, 8) - Less common, try last
5. Edges (3, 5) - Try after centers

## Worked Example: Crafting a Torch

### Scenario
You need to craft a torch. Your inventory is unknown.

### Step-by-Step Execution

**Call 1: Discover inventory**
```typescript
await tools.mcp_skillcraft_s6.craft({});
// Returns: {craftable: false, wouldProduce: null, 
//          grid: [[null,null,null],[null,null,null],[null,null,null]],
//          inventory: {"minecraft:stick": 2, "minecraft:coal": 1}}
```
**Observation**: Inventory contains 2 sticks and 1 coal. Torch recipe likely uses 1 coal + 1 stick.

**Call 2: Place coal in most likely position (top center, slot 1)**
```typescript
await tools.mcp_skillcraft_s6.place({ item: "minecraft:coal", slot: 1 });
// Returns: {craftable: false, wouldProduce: null,
//          grid: [[null, "minecraft:coal", null], [null, null, null], [null, null, null]],
//          inventory: {"minecraft:stick": 2}}
```
**Observation**: Coal placed. Not craftable yet. Need stick.

**Call 3: Place stick in most likely position (center, slot 4)**
```typescript
await tools.mcp_skillcraft_s6.place({ item: "minecraft:stick", slot: 4 });
// Returns: {craftable: true, wouldProduce: "minecraft:torch",
//          grid: [[null, "minecraft:coal", null], [null, "minecraft:stick", null], [null, null, null]],
//          inventory: {"minecraft:stick": 1}}
```
**Observation**: Grid is now craftable! `wouldProduce` confirms it will make a torch.

**Call 4: Craft the torch**
```typescript
await tools.mcp_skillcraft_s6.craft({});
// Returns: {success: true, produced: "minecraft:torch",
//          grid: [[null,null,null],[null,null,null],[null,null,null]],
//          inventory: {"minecraft:stick": 1, "minecraft:torch": 1}}
```
**Result**: Torch crafted successfully!

### Final Answer for Torch Challenge

Tool calls in order:
1. `tools.mcp_skillcraft_s6.craft({})` - Discover inventory
2. `tools.mcp_skillcraft_s6.place({ item: "minecraft:coal", slot: 1 })` - Place coal
3. `tools.mcp_skillcraft_s6.place({ item: "minecraft:stick", slot: 4 })` - Place stick  
4. `tools.mcp_skillcraft_s6.craft({})` - Craft torch

Final craft result: `{success: true, produced: "minecraft:torch", inventory: {"minecraft:stick": 1, "minecraft:torch": 1}}`

## General Strategies for Any Crafting Challenge

### When You Don't Know the Recipe

1. **Discover inventory** via `craft()` or trial placements
2. **Try common patterns**:
   - Vertical stack (slots 1, 4, 7)
   - Horizontal line (slots 1, 2, 3 or 3, 4, 5 or 6, 7, 8)
   - Center + one above (slots 1, 4) - Torches, signs
   - Center + one below (slots 4, 7) - Some tools
   - All 4 corners (slots 0, 2, 6, 8) - Rare
   - Full grid - Complex recipes
3. **Use feedback**: After each placement, check if `craftable: true`

### When You Know the Recipe But Not Inventory

1. Try to place each required item
2. If placement fails, that item is missing from inventory
3. Adjust: find alternative recipes or request different items

### When You Have Limited Items

1. Count required items for each potential recipe
2. Only attempt recipes where you have sufficient quantities
3. Use `take()` to reclaim items from failed attempts

### Common Recipe Patterns in Minecraft

| Item | Pattern | Slots |
|------|---------|-------|
| Torch | Coal + Stick | 1, 4 |
| Stick | 2 Planks vertical | 1, 4 or 4, 7 |
| Wooden Plank | 1 Log | 0, 1, 2, 3, 4, 5, 6, 7, 8 (any single slot) |
| Crafting Table | 4 Planks (2x2) | 0, 1, 3, 4 |
| Chest | 8 Planks (hollow) | All except center (4) |
| Furnace | 8 Cobblestone (hollow) | All except center (4) |

### Optimization Tips

1. **Start with center (slot 4)**: Most recipes use it
2. **Use `wouldProduce`**: Don't wait for final craft to check - each `place()` tells you if it's craftable
3. **Batch testing**: Place all copies of one item type, then check `wouldProduce`
4. **Clear and retry**: If stuck, `clear_grid()` and start fresh
5. **Read error messages**: They contain inventory data even on failure

## Debugging Failed Crafts

If `craftable: false`:
- Check `wouldProduce` is null - confirms no recipe matches current grid
- Verify item names match inventory exactly (e.g., "minecraft:coal" not just "coal")
- Ensure you're using correct slot numbers (0-8, row-major)
- Try different arrangements of the same items

If placement fails:
- Item not in inventory (error message tells you)
- Slot number invalid (must be 0-8)
- Try the exact item name format from inventory discovery
