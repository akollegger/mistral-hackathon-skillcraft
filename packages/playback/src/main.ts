/** Run replayer UI. Each loaded run gets a RunPane: crafting grid, craftable
 *  feedback, inventory strip, transport (scrub/step/play), and an event list.
 *  Panes are independent; load two files to compare teacher vs student. */
import { buildReplay, ParseError, type Replay, type ReplayStep } from "./replayer";
import { arrowSprite, itemSprite, mistralLogo } from "./sprites";

const GRID_CELLS = 9;

class RunPane {
  replay: Replay | null = null;
  fileName = "";
  index = -1; // -1 = before first event
  playing = false;
  speed = 1;
  private timer: number | null = null;

  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private badgesEl: HTMLElement;
  private cells: HTMLElement[] = [];
  private invEl: HTMLElement;
  private outSlot: HTMLElement;
  private outLabel: HTMLElement;
  private scrub: HTMLInputElement;
  private stepLabel: HTMLElement;
  private playBtn: HTMLButtonElement;
  private eventsEl: HTMLOListElement;

  constructor(container: HTMLElement, slotLabel: string, emptyHint: string) {
    this.root = document.createElement("section");
    this.root.className = "pane panel empty";
    this.root.innerHTML = `
      <header class="pane-head">
        <span class="slot-label">${slotLabel}</span>
        <span class="file-name">no file loaded</span>
        <span class="badges"></span>
      </header>
      <div class="empty-state"><span class="empty-art">▚▞</span><span>${emptyHint}</span></div>
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
      if (this.playing) this.startTimer(); // restart with new interval
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
    this.fileName = fileName;
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
    if (!this.replay || this.index >= this.lastIndex()) this.setIndex(0);
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

  private render(): void {
    if (!this.replay) {
      this.root.classList.add("empty");
      this.stepLabel.textContent = "–/–";
      return;
    }
    this.root.classList.remove("empty");
    const step: ReplayStep | null = this.index >= 0 ? this.replay.steps[this.index]! : null;
    // Grid
    for (let i = 0; i < GRID_CELLS; i++) {
      const cell = this.cells[i]!;
      const item = step ? step.grid[(i / 3) | 0]![i % 3] : null;
      cell.replaceChildren(item ? itemSprite(item) : document.createTextNode(""));
      cell.classList.toggle("filled", item !== null);
    }
    // Output / craftable feedback: show what the grid would craft, or — after a
    // successful craft — the item that was produced (the grid is consumed then).
    const craftable = step?.craftable ?? false;
    const shown = step ? (step.wouldProduce ?? step.lastProduced) : null;
    this.outSlot.replaceChildren(shown ? itemSprite(shown) : document.createTextNode(""));
    this.outSlot.classList.toggle("craftable", craftable);
    this.outSlot.classList.toggle("blocked", step !== null && !craftable && shown === null);
    this.outSlot.classList.toggle("produced", step?.craftSuccess === true);
    const craftNote = step?.craftSuccess === true ? " ✔" : step?.craftSuccess === false ? " ✘" : "";
    this.outLabel.textContent = shown ? `${shown}${craftNote}` : step ? "not craftable" : "?";
    // Inventory
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
    // Badges
    this.badgesEl.replaceChildren();
    const m = step?.meta ?? this.replay?.meta ?? null;
    if (m) {
      this.badgesEl.append(
        badge(`role-${m.role}`, m.role),
        badge(m.condition ? `cond-${m.condition}` : "cond-none", m.condition ?? "no aid"),
        badge(`tier-${m.tier}`, m.tier),
        badge(m.heldOut ? "held-out" : "seen", m.heldOut ? "held-out" : "seen"),
      );
      const end = this.replay!.steps[this.lastIndex()]!;
      const outcome = end.kind === "run_end" ? (end.label.split(": ").pop() ?? "") : (m.outcome ?? "…");
      this.badgesEl.appendChild(badge(`outcome-${outcome}`, outcome));
    }
    // Transport
    this.scrub.value = String(Math.max(0, this.index));
    this.stepLabel.textContent = `${this.index + 1}/${this.replay!.steps.length}`;
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

const logoHolder = document.getElementById("logo")!;
logoHolder.appendChild(mistralLogo());

const panesEl = document.getElementById("panes")!;
// Fixed pair layout: teacher always left, student always right (may be empty).
const teacherPane = new RunPane(panesEl, "TEACHER · LEFT", "drop a teacher events.jsonl, or click “demo: teacher”");
const studentPane = new RunPane(panesEl, "STUDENT · RIGHT", "optional — drop a student events.jsonl, or click “demo: student”");

async function loadInto(pane: RunPane, file: File): Promise<void> {
  pane.loadText(file.name, await file.text());
}

function wireInput(inputId: string, pane: RunPane): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) void loadInto(pane, f);
  });
}
wireInput("file-teacher", teacherPane);
wireInput("file-student", studentPane);

// Drag & drop anywhere: first file → teacher (left), second → student (right).
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files[0]) void loadInto(teacherPane, files[0]);
  if (files[1]) void loadInto(studentPane, files[1]);
});

async function loadDemo(which: "teacher" | "student"): Promise<void> {
  const res = await fetch(`./demo/${which}.events.jsonl`);
  if (!res.ok) throw new Error(`demo fetch failed: ${res.status}`);
  (which === "teacher" ? teacherPane : studentPane).loadText(`${which}.events.jsonl (demo)`, await res.text());
}
document.getElementById("demo-teacher")!.addEventListener("click", () => void loadDemo("teacher"));
document.getElementById("demo-student")!.addEventListener("click", () => void loadDemo("student"));
document.getElementById("demo-both")!.addEventListener("click", async () => {
  await loadDemo("teacher");
  await loadDemo("student");
});
