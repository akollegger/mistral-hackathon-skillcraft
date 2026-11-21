// @vitest-environment jsdom
/** End-to-end smoke test of the UI wiring: stub canvas 2d + fetch, load the
 *  demo pair, step through events, and assert grid cells actually receive
 *  item sprites at the right steps. */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

// jsdom has no canvas implementation — stub the 2d context.
beforeAll(() => {
  const fakeCtx = {
    imageSmoothingEnabled: true,
    fillStyle: "",
    fillRect: () => {},
  };
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return fakeCtx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  // jsdom lacks scrollIntoView (real browsers have it)
  Element.prototype.scrollIntoView = () => {};

  document.body.innerHTML = `
    <span id="logo"></span>
    <input id="file-teacher" type="file" />
    <input id="file-student" type="file" />
    <button id="demo-teacher"></button>
    <button id="demo-student"></button>
    <button id="demo-both"></button>
    <main id="panes"></main>
  `;

  // vitest runs with cwd = package dir
  const demo = (name: string) => readFileSync(`public/demo/${name}`, "utf8");
  vi.stubGlobal("fetch", async (url: string) => {
    const m = /demo\/(teacher|student)\.events\.jsonl/.exec(url);
    if (!m) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => demo(`${m[1]}.events.jsonl`) };
  });
});

const flush = () => new Promise((r) => setTimeout(r, 100));

describe("app smoke", () => {
  it("renders placed items on the teacher grid while stepping", async () => {
    await import("./main");
    (document.getElementById("demo-both") as HTMLButtonElement).click();
    await flush();

    const teacher = document.querySelectorAll("#panes .pane")[0] as HTMLElement;
    const student = document.querySelectorAll("#panes .pane")[1] as HTMLElement;
    expect(teacher.classList.contains("empty")).toBe(false);
    expect(student.classList.contains("empty")).toBe(false);

    const countSprites = (pane: Element) =>
      [...pane.querySelectorAll<HTMLElement>(".cell")].filter((c) => c.querySelector("canvas")).length;

    // Freshly loaded pane starts at the first event (empty grid), not the end.
    expect(teacher.querySelector(".step-label")!.textContent).toBe("1/16");
    expect(countSprites(teacher)).toBe(0);

    // Step indices in the teacher demo: 7 = feedback after 3rd plank (3 on grid),
    // 11 = feedback after 2nd stick (full pattern, 5 on grid), 13 = craft_result.
    const lis = [...teacher.querySelectorAll<HTMLElement>(".events li")];
    const clickStep = async (i: number) => {
      lis[i]!.click();
      await flush();
    };

    await clickStep(7);
    expect(countSprites(teacher)).toBe(3); // three planks on the grid

    await clickStep(11);
    expect(countSprites(teacher)).toBe(5); // full pickaxe pattern

    await clickStep(13); // craft_result: grid consumed, output shows the pickaxe
    expect(countSprites(teacher)).toBe(0);
    const out = teacher.querySelector(".output")!;
    expect(out.querySelector("canvas")).toBeTruthy();
    expect(out.classList.contains("craftable")).toBe(false);
    expect(out.classList.contains("produced")).toBe(true);
    expect(teacher.querySelector(".output-label")!.textContent).toContain("minecraft:wooden_pickaxe");

    // Student pane: step 8 = failed craft (grid keeps its 2 items),
    // step 10 = feedback after clear (grid empty).
    const slis = [...student.querySelectorAll<HTMLElement>(".events li")];
    slis[8]!.click();
    await flush();
    expect(countSprites(student)).toBe(2);
    slis[10]!.click();
    await flush();
    expect(countSprites(student)).toBe(0);
  });
});
