/** Procedural lofi pixel-art sprites. Every sprite is a real 32×32 pixel map
 *  (1 texel = 1 px) painted into a buffer, given a chunky dark outline via a
 *  post-pass, then blitted to a 32×32 canvas rendered with image-rendering:
 *  pixelated. No image assets, no dependencies. Mistral palette for UI chrome. */

export const MISTRAL = {
  yellow: "#FFD800",
  amber: "#FFAF00",
  orange: "#FF8205",
  vermilion: "#FA500F",
  red: "#E10500",
} as const;

const W = 32;
const H = 32;
const OUTLINE = "#14100c";

type Buf = (string | null)[];
const idx = (x: number, y: number) => y * W + x;
const newBuf = (): Buf => new Array<string | null>(W * H).fill(null);
function set(buf: Buf, x: number, y: number, c: string): void {
  if (x >= 0 && x < W && y >= 0 && y < H) buf[idx(x, y)] = c;
}
function rect(buf: Buf, x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(buf, x, y, c);
}
/** Deterministic per-pixel noise in [0,1). */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Fill transparent pixels adjacent to opaque ones with the outline color. */
function outline(buf: Buf, c = OUTLINE): void {
  const src = [...buf];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (src[idx(x, y)]) continue;
      if (src[idx(x + 1, y)] || src[idx(x - 1, y)] || src[idx(x, y + 1)] || src[idx(x, y - 1)]) set(buf, x, y, c);
    }
}

function blit(buf: Buf): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = buf[idx(x, y)];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  return cv;
}

// ---------- Palettes ----------
const WOOD = { dark: "#6e4f27", base: "#a07b4f", light: "#c49a66", hi: "#e0b986" };
const STONE = { dark: "#5c5c5c", base: "#8d8d8d", light: "#b5b5b5", hi: "#d4d4d4" };
const IRON = { dark: "#8f8a84", base: "#d9d3cc", light: "#f2ede6", hi: "#ffffff" };
const GOLD = { dark: "#b8860b", base: "#f7e26b", light: "#ffe98a", hi: "#fffbe0" };
const DIAMOND = { dark: "#2aa79b", base: "#59e8dc", light: "#a5f7ef", hi: "#e8fffd" };
const COAL = { dark: "#0a0a0a", base: "#2e2e2e", light: "#4a4a4a", hi: "#6b6b6b" };
const LEATHER = { dark: "#5e3319", base: "#9c5b33", light: "#bd7647", hi: "#d99a63" };

// ---------- Item painters (each returns a fully outlined 32×32 buffer) ----------

function paintPlanks(): Buf {
  const b = newBuf();
  rect(b, 3, 5, 28, 26, WOOD.base);
  // board seams
  for (const y of [11, 18, 25]) rect(b, 3, y, 28, y, WOOD.dark);
  // grain + knots
  for (let y = 5; y <= 26; y++)
    for (let x = 3; x <= 28; x++) {
      const n = hash2(x, y);
      if (n > 0.93) set(b, x, y, WOOD.dark);
      else if (n < 0.08) set(b, x, y, WOOD.light);
    }
  rect(b, 3, 5, 28, 5, WOOD.hi); // top highlight
  rect(b, 3, 26, 28, 26, WOOD.dark);
  rect(b, 15, 13, 16, 16, WOOD.dark); // knot
  outline(b);
  return b;
}

function paintStick(): Buf {
  const b = newBuf();
  for (let t = 0; t <= 18; t++) {
    const x = 7 + t, y = 25 - t;
    rect(b, x - 1, y - 1, x + 1, y + 1, WOOD.base);
    set(b, x - 1, y - 1, WOOD.hi);
    set(b, x + 1, y + 1, WOOD.dark);
  }
  outline(b);
  return b;
}

function paintCobblestone(): Buf {
  const b = newBuf();
  rect(b, 3, 5, 28, 26, STONE.dark); // mortar
  const rows = [5, 12, 19, 26];
  const cols = [3, 10, 17, 24, 28];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const n = hash2(c * 7 + 1, r * 13 + 5);
      const tone = n > 0.66 ? STONE.light : n > 0.33 ? STONE.base : "#7a7a7a";
      rect(b, cols[c]! + 1, rows[r]! + 1, cols[c + 1]! - 1, rows[r + 1]! - 1, tone);
      rect(b, cols[c]! + 1, rows[r]! + 1, cols[c + 1]! - 1, rows[r]! + 1, STONE.hi);
    }
  outline(b);
  return b;
}

function paintCoal(): Buf {
  const b = newBuf();
  const lump: [number, number][] = [
    [10, 12], [21, 12], [8, 16], [23, 16], [7, 20], [24, 20], [10, 24], [21, 24],
  ];
  rect(b, 9, 11, 22, 25, COAL.base);
  for (const [x, y] of lump) set(b, x, y, COAL.base);
  rect(b, 10, 12, 16, 14, COAL.light);
  set(b, 11, 13, COAL.hi);
  set(b, 20, 22, COAL.dark);
  outline(b);
  return b;
}

function paintIngot(p: { dark: string; base: string; light: string; hi: string }): Buf {
  const b = newBuf();
  // trapezoid: narrow top, wide bottom
  for (let y = 12; y <= 21; y++) {
    const inset = Math.max(0, 9 - (y - 12));
    rect(b, 6 + inset, y, 25 - inset, y, p.base);
  }
  rect(b, 9, 12, 22, 12, p.hi);
  rect(b, 10, 13, 21, 14, p.light);
  rect(b, 6, 21, 25, 21, p.dark);
  set(b, 7, 15, p.hi); // specular
  outline(b);
  return b;
}

function paintDiamond(): Buf {
  const b = newBuf();
  // classic gem silhouette: table on top, point at bottom
  const shape: [number, number, number][] = [
    // [y, xStart, xEnd]
    [7, 12, 19], [8, 10, 21], [9, 9, 22], [10, 8, 23], [11, 7, 24],
    [12, 6, 25], [13, 6, 25], [14, 6, 25], [15, 6, 25], [16, 7, 24],
    [17, 8, 23], [18, 9, 22], [19, 10, 21], [20, 11, 20], [21, 12, 19],
    [22, 13, 18], [23, 14, 17], [24, 15, 16],
  ];
  for (const [y, x0, x1] of shape) rect(b, x0, y, x1, y, DIAMOND.base);
  // facets: top table, left light, right dark, point shadow
  rect(b, 10, 8, 21, 9, DIAMOND.hi);
  for (const [y, x0, x1] of shape) {
    const mid = (x0 + x1) / 2;
    for (let x = x0; x <= x1; x++) {
      if (x < mid - 1) set(b, x, y, DIAMOND.light);
      else if (x > mid + 1) set(b, x, y, DIAMOND.dark);
    }
  }
  set(b, 11, 10, DIAMOND.hi);
  set(b, 12, 11, "#ffffff");
  outline(b);
  return b;
}

function paintLeather(): Buf {
  const b = newBuf();
  rect(b, 5, 7, 26, 24, LEATHER.base);
  rect(b, 5, 7, 26, 8, LEATHER.light);
  rect(b, 5, 23, 26, 24, LEATHER.dark);
  // stitches
  for (let x = 7; x <= 24; x += 3) {
    set(b, x, 9, LEATHER.dark);
    set(b, x, 22, LEATHER.dark);
  }
  for (let y = 9; y <= 22; y += 3) {
    set(b, 7, y, LEATHER.dark);
    set(b, 24, y, LEATHER.dark);
  }
  rect(b, 14, 12, 17, 19, LEATHER.light); // center patch
  outline(b);
  return b;
}

function paintCraftingTable(): Buf {
  const b = newBuf();
  rect(b, 3, 6, 28, 19, WOOD.base); // top
  rect(b, 3, 6, 28, 7, WOOD.hi);
  // 3×3 slot insets
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const x0 = 5 + c * 7, y0 = 8 + r * 4;
      rect(b, x0, y0, x0 + 5, y0 + 2, WOOD.dark);
    }
  rect(b, 3, 20, 28, 22, WOOD.dark); // front edge
  rect(b, 5, 23, 8, 27, WOOD.dark); // legs
  rect(b, 23, 23, 26, 27, WOOD.dark);
  outline(b);
  return b;
}

function paintPickaxe(head: { dark: string; base: string; light: string; hi: string }): Buf {
  const b = newBuf();
  // handle: diagonal, bottom-left → top-right
  for (let t = 0; t <= 16; t++) {
    const x = 6 + t, y = 26 - t;
    rect(b, x - 1, y - 1, x + 1, y + 1, WOOD.base);
    set(b, x - 1, y - 1, WOOD.light);
  }
  // head: curved pick across the top, perpendicular to the handle
  for (let t = 0; t <= 14; t++) {
    const x = 12 + t;
    const y = 8 + Math.round(4 * Math.sin((t / 14) * Math.PI)); // arc dipping mid
    rect(b, x - 1, y - 2, x + 1, y + 1, head.base);
    set(b, x, y - 2, head.hi);
    set(b, x, y + 1, head.dark);
  }
  // head sockets
  set(b, 13, 8, head.light);
  set(b, 25, 10, head.light);
  outline(b);
  return b;
}

/** Hash-tinted fallback gem for invented/derived items. */
function paintFallbackGem(itemId: string): Buf {
  const hue = hash2(itemId.length, [...itemId].reduce((a, c) => a + c.charCodeAt(0), 0)) * 360;
  const base = `hsl(${hue} 70% 55%)`;
  const light = `hsl(${hue} 80% 72%)`;
  const dark = `hsl(${hue} 70% 38%)`;
  const b = newBuf();
  const shape: [number, number, number][] = [
    [8, 12, 19], [9, 10, 21], [10, 8, 23], [11, 7, 24], [12, 6, 25],
    [13, 6, 25], [14, 7, 24], [15, 8, 23], [16, 9, 22], [17, 10, 21],
    [18, 11, 20], [19, 12, 19], [20, 13, 18], [21, 14, 17], [22, 15, 16],
  ];
  for (const [y, x0, x1] of shape) rect(b, x0, y, x1, y, base);
  rect(b, 10, 9, 21, 10, light);
  for (const [y, x0, x1] of shape) {
    const mid = (x0 + x1) / 2;
    for (let x = x0; x <= x1; x++) if (x > mid + 1) set(b, x, y, dark);
  }
  set(b, 12, 12, "#ffffff");
  outline(b);
  return b;
}

// ---------- Registry ----------
type Painter = () => Buf;
const PAINTERS: Record<string, Painter> = {
  planks: paintPlanks,
  stick: paintStick,
  cobblestone: paintCobblestone,
  stone: paintCobblestone,
  coal: paintCoal,
  iron_ingot: () => paintIngot(IRON),
  gold_ingot: () => paintIngot(GOLD),
  diamond: paintDiamond,
  leather: paintLeather,
  crafting_table: paintCraftingTable,
  wooden_pickaxe: () => paintPickaxe(WOOD),
  stone_pickaxe: () => paintPickaxe(STONE),
  iron_pickaxe: () => paintPickaxe(IRON),
  diamond_pickaxe: () => paintPickaxe(DIAMOND),
};

// Cache pixel buffers, NOT canvases: a DOM node can only be in one place, so
// returning a shared canvas would move it between grid cells and only the last
// duplicate item would render. Each call blits a fresh canvas from the buffer.
const cache = new Map<string, Buf>();

/** 32×32 sprite for an item id. Null/empty → empty slot canvas. */
export function itemSprite(itemId: string | null): HTMLCanvasElement {
  if (!itemId) return blit(newBuf());
  const hit = cache.get(itemId);
  if (hit) return blit(hit);
  const suffix = itemId.includes(":") ? itemId.split(":").slice(1).join(":") : itemId;
  const painter = PAINTERS[suffix];
  const buf = painter ? painter() : paintFallbackGem(itemId);
  cache.set(itemId, buf);
  return blit(buf);
}

/** The Mistral pixel "M": 5×5 texels in the brand gradient, on a 32×32 canvas. */
export function mistralLogo(): HTMLCanvasElement {
  const rows = ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"];
  const grad = [MISTRAL.yellow, MISTRAL.amber, MISTRAL.orange, MISTRAL.vermilion, MISTRAL.red];
  const b = newBuf();
  const s = 6; // 5 texels * 6 = 30, +1px margin
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y]!.length; x++) if (rows[y]![x] === "X") rect(b, 1 + x * s, 1 + y * s, 1 + x * s + s - 1, 1 + y * s + s - 1, grad[y]!);
  return blit(b);
}

/** Pixel arrow (→) between the grid and the craft output slot, 1px resolution. */
export function arrowSprite(): HTMLCanvasElement {
  const b = newBuf();
  const rows = [
    "........X.......",
    ".........X......",
    "..........X.....",
    "XXXXXXXXXXXXX...",
    ".XXXXXXXXXXXX...",
    "..........X.....",
    ".........X......",
    "........X.......",
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "X") set(b, x + 8, y + 12, MISTRAL.orange);
  });
  return blit(b);
}
