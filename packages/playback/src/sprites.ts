/** Procedural lofi pixel-art sprites: every sprite is a 32×32 canvas painted
 *  from an 8×8 pixel map (4 px per texel), rendered with image-rendering:
 *  pixelated. No image assets, no dependencies. Mistral palette for UI chrome. */

export const MISTRAL = {
  yellow: "#FFD800",
  amber: "#FFAF00",
  orange: "#FF8205",
  vermilion: "#FA500F",
  red: "#E10500",
} as const;

const PX = 4; // texel size on the 32×32 canvas
const N = 8; // pixel-map resolution

/** Minecraft-ish item colors. */
const C: Record<string, string> = {
  p: "#a07b4f", // plank
  P: "#c49a66", // plank highlight
  s: "#7d5f36", // stick
  t: "#8d8d8d", // stone
  T: "#b5b5b5", // stone highlight
  c: "#2e2e2e", // coal
  i: "#d9d3cc", // iron
  I: "#ffffff", // iron highlight
  g: "#f7e26b", // gold
  G: "#fff7b0", // gold highlight
  d: "#59e8dc", // diamond
  D: "#c8fff8", // diamond highlight
  o: "#FA500F", // vermilion orb
  O: "#FFD800", // orb highlight
  l: "#9c5b33", // leather
  w: "#5d4426", // wood dark
  k: "#17130e", // outline
  " ": "rgba(0,0,0,0)",
};

/** 8×8 pixel maps, keyed by item-id suffix (after the colon). */
const ART: Record<string, string[]> = {
  planks: [
    "pppppppp",
    "pPpppPpp",
    "pppppppp",
    "pppppPpp",
    "pppppppp",
    "pPpppppp",
    "pppppPpp",
    "pppppppp",
  ],
  stick: [
    "  ss    ",
    "  ss    ",
    "  sS    ",
    "  ss    ",
    "  ss    ",
    "  sS    ",
    "  ss    ",
    "  ss    ",
  ],
  cobblestone: [
    "tTttttTt",
    "tttttttt",
    "ttTttttt",
    "ttttttTt",
    "tttttttt",
    "tTtttttt",
    "ttttTtTt",
    "tttttttt",
  ],
  coal: [
    "  cccc  ",
    " ccccccc",
    "cccccccc",
    "cccccccc",
    "cccccccc",
    " ccccccc",
    "  cccc  ",
    "        ",
  ],
  iron_ingot: [
    "        ",
    " iiii   ",
    "iIIiii  ",
    "iiiiii  ",
    " iiiii  ",
    "  iiii  ",
    "        ",
    "        ",
  ],
  gold_ingot: [
    "        ",
    " gggg   ",
    "gGGggg  ",
    "gggggg  ",
    " gggg   ",
    "  gggg  ",
    "        ",
    "        ",
  ],
  diamond: [
    "   dd   ",
    "  dDDd  ",
    " dDddDd ",
    "dDddddDd",
    " dddddd ",
    "  dddd  ",
    "   dd   ",
    "        ",
  ],
  leather: [
    " llllll ",
    "lllllll ",
    "ll llll ",
    "lllllll ",
    "llll ll ",
    "lllllll ",
    " llllll ",
    "        ",
  ],
  crafting_table: [
    "pppppppp",
    "pPppppPp",
    "ppkppkpp",
    "pppppppp",
    "pkppppkp",
    "pppppppp",
    "pPppppPp",
    "wwwwwwww",
  ],
  wooden_pickaxe: [
    "ppppp ss",
    "Ppppp ss",
    "ppppp ss",
    "  pp  ss",
    "   p  ss",
    "  ss ss",
    "  ss  s",
    "  s   s",
  ],
  stone_pickaxe: [
    "ttttt ss",
    "Ttttt ss",
    "ttttt ss",
    "  tt  ss",
    "   t  ss",
    "  ss ss",
    "  ss  s",
    "  s   s",
  ],
  iron_pickaxe: [
    "iiiii ss",
    "IIIII ss",
    "iiiii ss",
    "  iii ss",
    "   i  ss",
    "  ss ss",
    "  ss  s",
    "  s   s",
  ],
  diamond_pickaxe: [
    "ddddd ss",
    "DDDDD ss",
    "ddddd ss",
    "  ddd ss",
    "   d  ss",
    "  ss ss",
    "  ss  s",
    "  s   s",
  ],
};

/** Generic fallback arts for invented/derived items, chosen by hash. */
const FALLBACKS: string[][] = [
  // gem blob
  [
    "        ",
    "  dddd  ",
    " dDddDd ",
    "dDddddDd",
    " dddddd ",
    "  dddd  ",
    "        ",
    "        ",
  ],
  // rune block (amber)
  [
    " gggggg ",
    " gkkggg ",
    " gkgggg ",
    " gggkgg ",
    " gkkggg ",
    " gggggg ",
    "        ",
    "        ",
  ],
  // orb (vermilion)
  [
    "  oooo  ",
    " oooooo ",
    "ooOooOoo",
    "oooooooo",
    " oooooo ",
    "  oooo  ",
    "        ",
    "        ",
  ],
];

const cache = new Map<string, HTMLCanvasElement>();

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function paint(map: string[]): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 32;
  cv.height = 32;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < N; y++) {
    const row = map[y] ?? "";
    for (let x = 0; x < N; x++) {
      const ch = row[x] ?? " ";
      const color = C[ch] ?? ch;
      if (color === "rgba(0,0,0,0)") continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * PX, y * PX, PX, PX);
    }
  }
  return cv;
}

/** 32×32 sprite for an item id (cached). Null/empty → empty slot canvas. */
export function itemSprite(itemId: string | null): HTMLCanvasElement {
  if (!itemId) return paint(Array(N).fill("        "));
  const hit = cache.get(itemId);
  if (hit) return hit;
  const suffix = itemId.includes(":") ? itemId.split(":").slice(1).join(":") : itemId;
  const art = ART[suffix] ?? FALLBACKS[hash(itemId) % FALLBACKS.length]!;
  const cv = paint(art);
  cache.set(itemId, cv);
  return cv;
}

/** The Mistral pixel "M": 5×5 texels in the brand gradient, on a 32×32 canvas. */
export function mistralLogo(): HTMLCanvasElement {
  const rows = ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"];
  const grad = [MISTRAL.yellow, MISTRAL.amber, MISTRAL.orange, MISTRAL.vermilion, MISTRAL.red];
  const cv = document.createElement("canvas");
  cv.width = 32;
  cv.height = 32;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const s = 6; // 5 texels * 6 = 30, +1px margin
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y]!.length; x++) {
      if (rows[y]![x] !== "X") continue;
      ctx.fillStyle = grad[y]!;
      ctx.fillRect(1 + x * s, 1 + y * s, s, s);
    }
  }
  return cv;
}

/** Pixel arrow (→) used between the grid and the craft output slot. */
export function arrowSprite(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 32;
  cv.height = 32;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = MISTRAL.orange;
  const rows = [
    "...X....",
    "....X...",
    "XXXXXXX.",
    ".XXXXXX.",
    "...X....",
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) if (row[x] === "X") ctx.fillRect(x * 4, (y + 1) * 4, 4, 4);
  });
  return cv;
}
