// @vitest-environment jsdom
/** End-to-end smoke test of the chooser UI: stub canvas 2d + fetch (demo
 *  fixtures only, /api/* 404s), boot the app, and verify the scenario chooser
 *  loads both panes on no-skill/taught runs and the story button advances
 *  4 → 1 → 5. */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  const fakeCtx = { imageSmoothingEnabled: true, fillStyle: "", fillRect: () => {} };
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return fakeCtx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Element.prototype.scrollIntoView = () => {};

  document.body.innerHTML = `
    <span id="logo"></span>
    <select id="scenario"></select>
    <button id="demo-story"></button>
    <input id="file-teacher" type="file" />
    <input id="file-student" type="file" />
    <div id="story-bar"></div>
    <main id="panes"></main>
    <section id="lineage"><button id="load-lineage"></button><div id="lineage-queries"></div><pre id="lineage-out"></pre></section>`;

  // /api/* is unavailable in tests → 404, forcing the demo-fixture fallback.
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.startsWith("./api/")) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    const path = url.replace(/^\.\//, "");
    try {
      const body = readFileSync(`public/${path}`, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    } catch {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }
  });
});

const flush = () => new Promise((r) => setTimeout(r, 100));
const panes = () => [...document.querySelectorAll<HTMLElement>("#panes .pane")];
const countSprites = (pane: Element) =>
  [...pane.querySelectorAll<HTMLElement>(".cell")].filter((c) => c.querySelector("canvas")).length;

describe("app smoke: scenario chooser + story", () => {
  it("boots into demo mode, loads teacher-none + student-none on both panes", async () => {
    await import("./main");
    await flush();
    const [teacher, student] = panes();
    expect(teacher!.classList.contains("empty")).toBe(false);
    expect(student!.classList.contains("empty")).toBe(false);
    expect(teacher!.querySelector(".file-name")!.textContent).toContain("teacher-none-taught");
    expect(student!.querySelector(".file-name")!.textContent).toContain("student-none-taught");
    // scenario select offers both demo scenarios
    const options = [...document.querySelectorAll<HTMLOptionElement>("#scenario option")].map((o) => o.value);
    expect(options).toContain("inv-bar-1");
    expect(options).toContain("inv-qux-heldout");
    // run select shows outcome + move count (no timestamps)
    const runOpt = teacher!.querySelector(".run-select option")!.textContent!;
    expect(runOpt).toBe("success · 6 moves");
  });

  it("skill toggle on the student pane swaps to the skill run", async () => {
    const [, student] = panes();
    const skillBtn = student!.querySelector<HTMLButtonElement>('.toggle[data-dim="condition"] button[data-v="skill"]')!;
    skillBtn.click();
    await flush();
    expect(student!.querySelector(".file-name")!.textContent).toContain("student-skill-taught");
    // play to the craft: output shows the produced bar
    const lis = [...student!.querySelectorAll<HTMLElement>(".events li")];
    const craft = lis.find((li) => li.textContent?.includes("crafted"));
    craft!.click();
    await flush();
    expect(student!.querySelector(".output-label")!.textContent).toContain("invented:bar");
    expect(countSprites(student!)).toBe(0);
  });

  it("held-out toggle on the teacher pane swaps to the held-out run", async () => {
    const [teacher] = panes();
    const heldBtn = teacher!.querySelector<HTMLButtonElement>('.toggle[data-dim="heldOut"] button[data-v="true"]')!;
    const skillBtn = teacher!.querySelector<HTMLButtonElement>('.toggle[data-dim="condition"] button[data-v="skill"]')!;
    skillBtn.click();
    await flush();
    heldBtn.click();
    await flush();
    expect(teacher!.querySelector(".file-name")!.textContent).toContain("teacher-skill-heldout");
    // held-out badge removed (redundant with toggle) — toggle shows the state instead
    expect(teacher!.querySelector('.toggle[data-dim="heldOut"] button[data-v="true"]')!.classList.contains("on")).toBe(true);
    expect(teacher!.querySelector(".badges")!.textContent).toContain("invented"); // tier badge remains
  });

  it("demo story auto-loops 4 → 1 → 5 and stops on toggle", async () => {
    vi.useFakeTimers();
    try {
      const story = document.getElementById("demo-story") as HTMLButtonElement;
      const bar = document.getElementById("story-bar")!;
      // Record caption changes while the loop runs; expect 1/3 → 2/3 → 3/3 in order.
      const seen: string[] = [];
      story.click(); // start the loop
      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        const m = /(\d\/3)/.exec(bar.textContent ?? "");
        if (m && seen[seen.length - 1] !== m[1]) seen.push(m[1]!);
        if (seen.length >= 3) break;
      }
      expect(seen).toEqual(["1/3", "2/3", "3/3"]);
      story.click(); // stop the loop
      expect(bar.textContent).toContain("stopped");
    } finally {
      vi.useRealTimers();
    }
  });
});
