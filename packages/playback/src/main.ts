/** Run replayer UI with a scenario chooser (docs/demo-matrix.md).
 *
 *  Both panes always visible: teacher left, student right. Each pane has a
 *  skill toggle (no skill | skill) and a held-out toggle (taught | held-out);
 *  loading a scenario starts both panes on the no-skill/taught runs
 *  (matrix runs 1 + 4). A demo-story button walks 4 → 1 → 5: student baseline,
 *  teacher generates the skill, student with skill. */
import { LINEAGE_QUERIES, loadLineageDb, type LineageDb } from "./relate-wasm";
import { buildReplay, ParseError, type Replay, type ReplayStep } from "./replayer";
import { fetchRunEvents, fetchRunIndex, pickRun, scenariosOf, type RunIndex, type RunSummary } from "./runs";
import { arrowSprite, itemSprite, mistralLogo } from "./sprites";

const GRID_CELLS = 9;

type Condition = "none" | "skill";

class RunPane {
  role: "teacher" | "student";
  condition: Condition = "none";
  heldOut = false;
  replay: Replay | null = null;
  runLabel = "";
  index = -1;
  playing = false;
  speed = 1;
  private timer: number | null = null;

  readonly root: HTMLElement;
  readonly nameEl: HTMLElement;
  private badgesEl: HTMLElement;
  private cells: HTMLElement[] = [];
  private invEl: HTMLElement;
  private outSlot: HTMLElement;
  private outLabel: HTMLElement;
  private scrub: HTMLInputElement;
  private stepLabel: HTMLElement;
  private playBtn: HTMLButtonElement;
  private eventsEl: HTMLOListElement;
  readonly condButtons: HTMLButtonElement[];
  readonly heldButtons: HTMLButtonElement[];
  readonly runSelect: HTMLSelectElement;

  constructor(container: HTMLElement, role: "teacher" | "student") {
    this.role = role;
    this.root = document.createElement("section");
    this.root.className = "pane panel empty";
    this.root.innerHTML = `
      <header class="pane-head">
        <span class="slot-label">${role.toUpperCase()}</span>
        <span class="toggle" data-dim="condition">
          <button type="button" data-v="none" class="on">no skill</button><button type="button" data-v="skill">skill</button>
        </span>
        <span class="toggle" data-dim="heldOut">
          <button type="button" data-v="false" class="on">taught</button><button type="button" data-v="true">held-out</button>
        </span>
        <select class="run-select" title="run"></select>
        <span class="file-name">no run loaded</span>
        <span class="badges"></span>
      </header>
      <div class="empty-state"><span class="empty-art">▚▞</span><span>no matching run for this scenario — adjust the toggles</span></div>
      <div class="board">
        <div class="grid" role="grid" aria-label="3x3 crafting grid"></div>
        <div class="arrow"></div>
        <div class="output-wrap">
          <div class="slot output"></div>
          <div class="output-label">?</div>
        </div>
      </div>
      <div class="inventory panel-inset" aria-label="inventory"></div>
      <div class="transport">
        <button data-act="first" title="first event">⏮</button>
        <button data-act="prev" title="step back">◀</button>
        <button data-act="play" class="play" title="play/pause">▶</button>
        <button data-act="next" title="step forward">▶|</button>
        <button data-act="last" title="last event">⏭</button>
        <input type="range" class="scrub" min="0" max="0" value="0" step="1" aria-label="scrub" />
        <span class="step-label">–/–</span>
        <select class="speed" title="playback speed">
          <option value="0.5">0.5×</option>
          <option value="1" selected>1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </div>
      <ol class="events panel-inset"></ol>
    `;
    container.appendChild(this.root);

    this.nameEl = this.root.querySelector(".file-name")!;
    this.badgesEl = this.root.querySelector(".badges")!;
    const gridEl = this.root.querySelector(".grid")!;
    for (let i = 0; i < GRID_CELLS; i++) {
      const cell = document.createElement("div");
      cell.className = "slot cell";
      cell.dataset.slot = String(i);
      gridEl.appendChild(cell);
      this.cells.push(cell);
    }
    this.root.querySelector(".arrow")!.appendChild(arrowSprite());
    this.invEl = this.root.querySelector(".inventory")!;
    this.outSlot = this.root.querySelector(".output")!;
    this.outLabel = this.root.querySelector(".output-label")!;
    this.scrub = this.root.querySelector(".scrub")!;
    this.stepLabel = this.root.querySelector(".step-label")!;
    this.playBtn = this.root.querySelector('[data-act="play"]')!;
    this.eventsEl = this.root.querySelector(".events")!;
    this.condButtons = [...this.root.querySelectorAll<HTMLButtonElement>('.toggle[data-dim="condition"] button')];
    this.heldButtons = [...this.root.querySelectorAll<HTMLButtonElement>('.toggle[data-dim="heldOut"] button')];
    this.runSelect = this.root.querySelector(".run-select")!;

    this.root.querySelector(".transport")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "play") this.togglePlay();
      else if (act === "first") this.setIndex(0);
      else if (act === "last") this.setIndex(this.lastIndex());
      else if (act === "prev") this.setIndex(this.index - 1);
      else if (act === "next") this.setIndex(this.index + 1);
    });
    this.scrub.addEventListener("input", () => this.setIndex(Number(this.scrub.value)));
    this.root.querySelector(".speed")!.addEventListener("change", (e) => {
      this.speed = Number((e.target as HTMLSelectElement).value);
      if (this.playing) this.startTimer();
    });
    this.eventsEl.addEventListener("click", (e) => {
      const li = (e.target as HTMLElement).closest("li[data-idx]");
      if (li) this.setIndex(Number((li as HTMLElement).dataset.idx));
    });
  }

  private lastIndex(): number {
    return this.replay ? this.replay.steps.length - 1 : 0;
  }

  loadText(fileName: string, text: string): void {
    try {
      this.replay = buildReplay(text);
    } catch (e) {
      this.replay = null;
      this.nameEl.textContent = `${fileName} — ${e instanceof ParseError ? e.message : String(e)}`;
      this.nameEl.classList.add("error");
      this.stop();
      this.render();
      return;
    }
    this.runLabel = fileName;
    this.nameEl.textContent = fileName;
    this.nameEl.classList.remove("error");
    this.root.classList.remove("empty");
    this.scrub.max = String(this.lastIndex());
    this.eventsEl.innerHTML = "";
    this.replay.steps.forEach((s, i) => {
      const li = document.createElement("li");
      li.dataset.idx = String(i);
      li.innerHTML = `<span class="seq">${s.seq}</span> <span class="kind kind-${s.kind}">${s.kind}</span> ${escapeHtml(s.label)}`;
      this.eventsEl.appendChild(li);
    });
    this.stop();
    this.setIndex(0); // start at the beginning so play/scrub shows placement
  }

  setIndex(i: number): void {
    if (!this.replay) return;
    this.index = Math.max(-1, Math.min(i, this.lastIndex()));
    if (this.index >= this.lastIndex()) this.stop();
    this.render();
  }

  togglePlay(): void {
    this.playing ? this.stop() : this.play();
  }

  play(): void {
    if (!this.replay) return;
    if (this.index >= this.lastIndex()) this.setIndex(0);
    this.playing = true;
    this.playBtn.textContent = "⏸";
    this.startTimer();
  }

  stop(): void {
    this.playing = false;
    this.playBtn.textContent = "▶";
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startTimer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (this.index >= this.lastIndex()) {
        this.stop();
        return;
      }
      this.setIndex(this.index + 1);
    }, 700 / this.speed);
  }

  render(): void {
    if (!this.replay) {
      this.root.classList.add("empty");
      this.stepLabel.textContent = "–/–";
      return;
    }
    this.root.classList.remove("empty");
    const step: ReplayStep | null = this.index >= 0 ? this.replay.steps[this.index]! : null;
    for (let i = 0; i < GRID_CELLS; i++) {
      const cell = this.cells[i]!;
      const item = step ? step.grid[(i / 3) | 0]![i % 3] : null;
      cell.replaceChildren(item ? itemSprite(item) : document.createTextNode(""));
      cell.classList.toggle("filled", item !== null);
    }
    const craftable = step?.craftable ?? false;
    const shown = step ? (step.wouldProduce ?? step.lastProduced) : null;
    this.outSlot.replaceChildren(shown ? itemSprite(shown) : document.createTextNode(""));
    this.outSlot.classList.toggle("craftable", craftable);
    this.outSlot.classList.toggle("blocked", step !== null && !craftable && shown === null);
    this.outSlot.classList.toggle("produced", step?.craftSuccess === true);
    const craftNote = step?.craftSuccess === true ? " ✔" : step?.craftSuccess === false ? " ✘" : "";
    this.outLabel.textContent = shown ? `${shown}${craftNote}` : step ? "not craftable" : "?";
    this.invEl.replaceChildren();
    if (step) {
      for (const [item, qty] of step.inventory) {
        const slot = document.createElement("div");
        slot.className = "slot inv-slot";
        slot.appendChild(itemSprite(item));
        const n = document.createElement("span");
        n.className = "qty";
        n.textContent = String(qty);
        slot.appendChild(n);
        slot.title = item;
        this.invEl.appendChild(slot);
      }
      if (step.inventory.length === 0) {
        const empty = document.createElement("span");
        empty.className = "inv-empty";
        empty.textContent = "(empty)";
        this.invEl.appendChild(empty);
      }
    }
    // Only badges not already reflected elsewhere: tier + outcome. Role,
    // condition and held-out are shown by the pane label and toggles.
    this.badgesEl.replaceChildren();
    const m = step?.meta ?? this.replay.meta;
    if (m) {
      if (m.tier) this.badgesEl.appendChild(badge(`tier-${m.tier}`, m.tier));
      const end = this.replay.steps[this.lastIndex()]!;
      const outcome = end.kind === "run_end" ? (end.label.split(": ").pop() ?? "") : (m.outcome ?? "…");
      this.badgesEl.appendChild(badge(`outcome-${outcome}`, outcome));
    }
    this.scrub.value = String(Math.max(0, this.index));
    this.stepLabel.textContent = `${this.index + 1}/${this.replay.steps.length}`;
    [...this.eventsEl.children].forEach((li, i) => {
      li.classList.toggle("active", i === this.index);
      if (i === this.index) li.scrollIntoView({ block: "nearest" });
    });
  }
}

function badge(cls: string, text: string): HTMLElement {
  const b = document.createElement("span");
  b.className = `badge ${cls}`;
  b.textContent = text;
  return b;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ---- App wiring ----

document.getElementById("logo")!.appendChild(mistralLogo());

const panesEl = document.getElementById("panes")!;
const teacherPane = new RunPane(panesEl, "teacher");
const studentPane = new RunPane(panesEl, "student");

let index: RunIndex | null = null;
let scenario = "";
let scenarioTier: string | undefined;

const scenarioSelect = document.getElementById("scenario") as HTMLSelectElement;
const storyBtn = document.getElementById("demo-story") as HTMLButtonElement;
const storyBar = document.getElementById("story-bar")!;

function matchingRuns(pane: RunPane): RunSummary[] {
  if (!index) return [];
  return index.runs.filter((r) => {
    if (r.role !== pane.role || (r.condition ?? "none") !== pane.condition) return false;
    if (pane.heldOut) return r.heldOut === true && (scenarioTier === undefined || r.tier === scenarioTier);
    return r.taskId === scenario && !r.heldOut;
  });
}

async function loadPaneRun(pane: RunPane): Promise<void> {
  if (!index) return;
  const matches = matchingRuns(pane);
  pane.runSelect.innerHTML = "";
  for (const r of matches) {
    const opt = document.createElement("option");
    opt.value = r.runId;
    opt.textContent = `${r.outcome ?? "…"} · ${r.toolCalls ?? "?"} moves`;
    pane.runSelect.appendChild(opt);
  }
  const run = pickRun(index.runs, { role: pane.role, condition: pane.condition, heldOut: pane.heldOut, taskId: scenario, tier: scenarioTier });
  if (!run) {
    pane.replay = null;
    pane.nameEl.textContent = "no matching run";
    pane.stop();
    pane.render();
    return;
  }
  pane.runSelect.value = run.runId;
  const text = await fetchRunEvents(run);
  pane.loadText(run.file ? run.file : `${run.runId.slice(0, 8)}…`, text);
}

function syncToggle(buttons: HTMLButtonElement[], value: string): void {
  for (const b of buttons) b.classList.toggle("on", b.dataset.v === value);
}

function wirePane(pane: RunPane): void {
  for (const b of pane.condButtons)
    b.addEventListener("click", () => {
      pane.condition = b.dataset.v as Condition;
      syncToggle(pane.condButtons, b.dataset.v!);
      void loadPaneRun(pane);
    });
  for (const b of pane.heldButtons)
    b.addEventListener("click", () => {
      pane.heldOut = b.dataset.v === "true";
      syncToggle(pane.heldButtons, b.dataset.v!);
      void loadPaneRun(pane);
    });
  pane.runSelect.addEventListener("change", async () => {
    const run = matchingRuns(pane).find((r) => r.runId === pane.runSelect.value);
    if (run && index) pane.loadText(run.file ? run.file : run.runId.slice(0, 8), await fetchRunEvents(run));
  });
}
wirePane(teacherPane);
wirePane(studentPane);

async function loadScenario(taskId: string): Promise<void> {
  scenario = taskId;
  scenarioTier = scenariosOf(index?.runs ?? []).find((s) => s.taskId === taskId)?.tier;
  // Both panes start on the no-skill / taught runs (matrix runs 1 + 4).
  teacherPane.condition = "none";
  teacherPane.heldOut = false;
  studentPane.condition = "none";
  studentPane.heldOut = false;
  syncToggle(teacherPane.condButtons, "none");
  syncToggle(teacherPane.heldButtons, "false");
  syncToggle(studentPane.condButtons, "none");
  syncToggle(studentPane.heldButtons, "false");
  await Promise.all([loadPaneRun(teacherPane), loadPaneRun(studentPane)]);
}

// Demo story: 4 → 1 → 5 (student baseline, teacher generates skill, student with skill).
const STORY = [
  { caption: "1/3 · student, no skill — the cold baseline", pane: () => studentPane, condition: "none" as Condition, heldOut: false },
  { caption: "2/3 · teacher, no skill — searches and generates the skill", pane: () => teacherPane, condition: "none" as Condition, heldOut: false },
  { caption: "3/3 · student, with the generated skill — the lift", pane: () => studentPane, condition: "skill" as Condition, heldOut: false },
];
let storyStep = -1;
storyBtn.addEventListener("click", async () => {
  storyStep = (storyStep + 1) % STORY.length;
  const s = STORY[storyStep]!;
  const pane = s.pane();
  pane.condition = s.condition;
  pane.heldOut = s.heldOut;
  syncToggle(pane.condButtons, s.condition);
  syncToggle(pane.heldButtons, "false");
  storyBar.textContent = s.caption;
  await loadPaneRun(pane);
  pane.play();
});

// Manual file loading still works: pickers + drag & drop.
function wireInput(inputId: string, pane: RunPane): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (f) pane.loadText(f.name, await f.text());
  });
}
wireInput("file-teacher", teacherPane);
wireInput("file-student", studentPane);
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files[0]) void files[0].text().then((t) => teacherPane.loadText(files[0]!.name, t));
  if (files[1]) void files[1].text().then((t) => studentPane.loadText(files[1]!.name, t));
});

// Boot: discover runs (dev API or demo fixtures), pick the latest scenario.
void (async () => {
  try {
    index = await fetchRunIndex();
  } catch (e) {
    storyBar.textContent = `run discovery failed: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  const scenarios = scenariosOf(index.runs);
  scenarioSelect.innerHTML = "";
  for (const s of scenarios) {
    const opt = document.createElement("option");
    opt.value = s.taskId;
    opt.textContent = `${s.taskId}${s.tier ? ` · ${s.tier}` : ""}`;
    scenarioSelect.appendChild(opt);
  }
  if (scenarios.length > 0) {
    await loadScenario(scenarios[0]!.taskId);
    if (!index.demo) storyBar.textContent = `${index.runs.length} runs from ${index.source === "relate" ? "Relate lineage graph" : "results/ JSONL"} — press ▶ demo story for the fixtures`;
    else storyBar.textContent = "demo fixtures loaded (no results/ dir) — press ▶ demo story";
  }
  scenarioSelect.addEventListener("change", () => void loadScenario(scenarioSelect.value));
})();

// ---- Lineage panel (relate-wasm, static export) ----

let lineageDb: LineageDb | null = null;
const lineageOut = document.getElementById("lineage-out")!;
const lineageQueries = document.getElementById("lineage-queries")!;

function renderRows(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    lineageOut.textContent = "(no rows)";
    return;
  }
  const cols = Object.keys(rows[0]!);
  const lines = [
    cols.map((c) => c.padEnd(24)).join(" "),
    cols.map(() => "-".repeat(24)).join(" "),
    ...rows.map((r) => cols.map((c) => String(r[c] ?? "").padEnd(24)).join(" ")),
  ];
  lineageOut.textContent = lines.join("\n");
}

document.getElementById("load-lineage")!.addEventListener("click", async (e) => {
  const btn = e.target as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "loading wasm…";
  try {
    lineageDb = await loadLineageDb();
    lineageOut.textContent = "graph loaded — pick a query";
    lineageQueries.innerHTML = "";
    for (const q of LINEAGE_QUERIES) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = q.name;
      b.addEventListener("click", () => {
        try {
          renderRows(lineageDb!.query(q.cypher));
        } catch (err) {
          lineageOut.textContent = `query error: ${err instanceof Error ? err.message : String(err)}`;
        }
      });
      lineageQueries.appendChild(b);
    }
  } catch (err) {
    lineageOut.textContent = `load failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "reload graph.json";
  }
});
