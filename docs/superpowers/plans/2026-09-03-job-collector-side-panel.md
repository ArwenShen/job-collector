# Job Collector Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the transient extension popup with a persistent Chrome Side Panel that collects the current job on demand, lists stored jobs, supports notes, single-row delete with undo, clear confirmation, and unchanged CSV export.

**Architecture:** Keep the existing platform extractors, `JobRecord`, CSV serializer, and local-only privacy model. Add a minimal MV3 service worker to open the native Side Panel, extend the repository with explicit ordering and row mutations, and implement the panel as a pure renderer plus a controller whose dependencies are testable without Chrome. Every collect click performs a fresh active-tab extraction; the panel never relies on a record cached when it opened.

**Tech Stack:** Chrome Extension Manifest V3, Chrome Side Panel API, TypeScript, native HTML/CSS/DOM, Vite, Vitest, jsdom, `chrome.storage.local`.

---

## File map

### Create

- `src/background/configure-side-panel.ts` — pure helper that configures action-click Side Panel behavior.
- `src/background/index.ts` — MV3 service-worker entry point.
- `src/sidepanel/index.html` — Side Panel document shell.
- `src/sidepanel/extract-active-tab.ts` — fresh current-tab extraction bridge.
- `src/sidepanel/controller.ts` — list state, collection, note, delete/undo, clear, and export use cases.
- `src/sidepanel/view.ts` — DOM-only rendering of panel state with safe `textContent` insertion.
- `src/sidepanel/index.ts` — production dependency wiring and delegated UI events.
- `src/sidepanel/styles.css` — compact dark-violet Side Panel layout and responsive column rules.
- `tests/background/configure-side-panel.test.ts` — Side Panel behavior configuration test.
- `tests/sidepanel/controller.test.ts` — controller state and mutation tests.
- `tests/sidepanel/view.test.ts` — list, tooltip attributes, dialogs, and disabled-state tests.

### Modify

- `src/public/manifest.json` — replace Popup declaration with Side Panel and service worker.
- `vite.config.ts` — build Side Panel HTML and stable `background.js` entry.
- `src/storage/job-repository.ts` — stable order, note update, remove, and restore operations.
- `tests/manifest.test.ts` — assert the new approved manifest surface.
- `tests/storage/job-repository.test.ts` — cover migration, ordering, note preservation, delete, and restore.
- `README.md` — update installation, usage, permissions, and manual acceptance instructions.

### Remove after replacement is green

- `src/popup/index.html`
- `src/popup/index.ts`
- `src/popup/controller.ts`
- `src/popup/view.ts`
- `src/popup/styles.css`
- `tests/popup/controller.test.ts`

Do not modify the four extraction adapters, `JobRecord` CSV columns, CSV serializer, or sample HTML as part of this feature unless a regression test demonstrates a pre-existing defect.

---

### Task 1: Add the native Side Panel extension shell

**Files:**
- Create: `src/background/configure-side-panel.ts`
- Create: `src/background/index.ts`
- Create: `src/sidepanel/index.html`
- Create: `tests/background/configure-side-panel.test.ts`
- Modify: `src/public/manifest.json:1-11`
- Modify: `vite.config.ts:1-16`
- Modify: `tests/manifest.test.ts:5-17`

- [ ] **Step 1: Write failing manifest and background tests**

Replace the manifest assertions and add the pure background test:

```ts
// tests/manifest.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manifest", () => {
  it("declares the approved Side Panel surface", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/public/manifest.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage", "sidePanel"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest.action).toEqual({ default_title: "岗位收集器" });
    expect(manifest.side_panel).toEqual({ default_path: "sidepanel/index.html" });
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
  });
});
```

```ts
// tests/background/configure-side-panel.test.ts
import { describe, expect, it, vi } from "vitest";
import { configureSidePanel } from "../../src/background/configure-side-panel";

describe("configureSidePanel", () => {
  it("opens the Side Panel when the toolbar action is clicked", async () => {
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    await configureSidePanel({ setPanelBehavior });
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });
});
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
npx vitest run tests/manifest.test.ts tests/background/configure-side-panel.test.ts
```

Expected: FAIL because the manifest still declares `default_popup`, lacks `sidePanel` and a service worker, and the background helper does not exist.

- [ ] **Step 3: Implement the manifest and service-worker shell**

Create:

```ts
// src/background/configure-side-panel.ts
export interface SidePanelLike {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
}

export function configureSidePanel(sidePanel: SidePanelLike): Promise<void> {
  return sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
```

```ts
// src/background/index.ts
import { configureSidePanel } from "./configure-side-panel";

void configureSidePanel(chrome.sidePanel).catch(() => {
  // Chrome retries extension initialization on the next service-worker start.
});
```

Use this manifest:

```json
{
  "manifest_version": 3,
  "name": "岗位收集器",
  "description": "收集当前职位详情并导出为 CSV。",
  "version": "0.2.0",
  "permissions": ["activeTab", "scripting", "storage", "sidePanel"],
  "action": {
    "default_title": "岗位收集器"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/index.html"
  }
}
```

Create the document shell:

```html
<!-- src/sidepanel/index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>岗位收集器</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

Configure Vite with two entries and a stable service-worker filename:

```ts
// vite.config.ts
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(process.cwd(), "src/sidepanel/index.html"),
        background: resolve(process.cwd(), "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "background"
          ? "background.js"
          : "assets/[name]-[hash].js",
      },
    },
  },
});
```

For this task only, add minimal compiling placeholders for `src/sidepanel/index.ts` and `src/sidepanel/styles.css`; Task 5 replaces them:

```ts
// src/sidepanel/index.ts
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Side Panel root is missing");
root.textContent = "岗位收集器";
```

```css
/* src/sidepanel/styles.css */
:root { font-family: system-ui, sans-serif; }
```

- [ ] **Step 4: Run tests and a build**

Run:

```bash
npx vitest run tests/manifest.test.ts tests/background/configure-side-panel.test.ts
npm run build
```

Expected: both tests PASS; build exits 0; `dist/manifest.json`, `dist/background.js`, `dist/sidepanel/index.html`, and `dist/content.js` exist.

- [ ] **Step 5: Commit the shell**

```bash
git add src/public/manifest.json src/background src/sidepanel/index.html src/sidepanel/index.ts src/sidepanel/styles.css vite.config.ts tests/manifest.test.ts tests/background/configure-side-panel.test.ts
git commit -m "feat: add native side panel shell"
```

---

### Task 2: Extend local storage for ordered row management

**Files:**
- Modify: `src/storage/job-repository.ts:1-39`
- Modify: `tests/storage/job-repository.test.ts:1-43`

- [ ] **Step 1: Add failing repository tests**

Extend the memory storage helper so `get(key)` returns only requested storage keys, then add these cases:

```ts
it("keeps first-insert order when a duplicate is refreshed", async () => {
  const repository = createJobRepository(memoryArea());
  await repository.save(record("1", "第一条"));
  await repository.save(record("2", "第二条"));
  await repository.save({ ...record("1", "第一条更新"), collected_at: "2026-09-03T10:00:00.000Z" });
  expect((await repository.list()).map((item) => item.source_job_id)).toEqual(["1", "2"]);
});

it("preserves a user note when the extracted record is refreshed", async () => {
  const repository = createJobRepository(memoryArea());
  await repository.save(record("1", "岗位"));
  await repository.updateNote({ source_site: "boss", source_job_id: "1" }, "重点关注");
  await repository.save({ ...record("1", "新标题"), note: "" });
  expect((await repository.list())[0]).toMatchObject({ job_title: "新标题", note: "重点关注" });
});

it("removes and restores a record at its original position", async () => {
  const repository = createJobRepository(memoryArea());
  await repository.save(record("1", "第一条"));
  await repository.save(record("2", "第二条"));
  const removed = await repository.remove({ source_site: "boss", source_job_id: "1" });
  expect(removed).toMatchObject({ index: 0, record: { source_job_id: "1" } });
  expect((await repository.list()).map((item) => item.source_job_id)).toEqual(["2"]);
  await repository.restore(removed!.record, removed!.index);
  expect((await repository.list()).map((item) => item.source_job_id)).toEqual(["1", "2"]);
});

it("reads legacy records and initializes order without losing data", async () => {
  const area = memoryArea({
    "jobCollector.records.v1": {
      "boss:1": record("1", "第一条"),
      "boss:2": record("2", "第二条"),
    },
  });
  const repository = createJobRepository(area);
  expect((await repository.list()).map((item) => item.source_job_id)).toEqual(["1", "2"]);
});
```

Use this helper signature in the test file:

```ts
function memoryArea(seed: Record<string, unknown> = {}) {
  const memory = { ...seed };
  return {
    get: async (key: string) => ({ [key]: memory[key] }),
    set: async (value: Record<string, unknown>) => { Object.assign(memory, value); },
  };
}
```

- [ ] **Step 2: Run repository tests and verify they fail**

Run:

```bash
npx vitest run tests/storage/job-repository.test.ts
```

Expected: FAIL because `updateNote`, `remove`, and `restore` do not exist and current `list()` sorts by refreshed `collected_at`.

- [ ] **Step 3: Implement explicit order and mutations**

Refactor `src/storage/job-repository.ts` around these contracts:

```ts
import type { JobRecord } from "../shared/job-record";

const STORAGE_KEY = "jobCollector.records.v1";
const ORDER_KEY = "jobCollector.order.v1";

type Identity = Pick<JobRecord, "source_site" | "source_job_id">;

interface StorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface RemovedJob {
  record: JobRecord;
  index: number;
}

export function buildStorageKey(record: Identity): string {
  return `${record.source_site}:${record.source_job_id}`;
}

export function createJobRepository(area: StorageLike = chrome.storage.local) {
  async function readMap(): Promise<Record<string, JobRecord>> {
    const result = await area.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as Record<string, JobRecord> | undefined) ?? {};
  }

  async function readState(): Promise<{ records: Record<string, JobRecord>; order: string[] }> {
    const records = await readMap();
    const result = await area.get(ORDER_KEY);
    const stored = Array.isArray(result[ORDER_KEY]) ? result[ORDER_KEY] as string[] : [];
    const valid = stored.filter((key, index) => key in records && stored.indexOf(key) === index);
    const missing = Object.keys(records).filter((key) => !valid.includes(key));
    return { records, order: [...valid, ...missing] };
  }

  async function write(records: Record<string, JobRecord>, order: string[]): Promise<void> {
    await area.set({ [STORAGE_KEY]: records, [ORDER_KEY]: order });
  }

  return {
    async save(record: JobRecord): Promise<void> {
      const { records, order } = await readState();
      const key = buildStorageKey(record);
      const existing = records[key];
      records[key] = { ...record, note: existing?.note ?? record.note };
      if (!order.includes(key)) order.push(key);
      await write(records, order);
    },
    async list(): Promise<JobRecord[]> {
      const { records, order } = await readState();
      return order.flatMap((key) => records[key] ? [records[key]] : []);
    },
    async count(): Promise<number> {
      return Object.keys(await readMap()).length;
    },
    async has(identity: Identity): Promise<boolean> {
      return buildStorageKey(identity) in await readMap();
    },
    async updateNote(identity: Identity, note: string): Promise<void> {
      const { records, order } = await readState();
      const key = buildStorageKey(identity);
      const record = records[key];
      if (!record) throw new Error("Job record not found");
      records[key] = { ...record, note };
      await write(records, order);
    },
    async remove(identity: Identity): Promise<RemovedJob | null> {
      const { records, order } = await readState();
      const key = buildStorageKey(identity);
      const record = records[key];
      const index = order.indexOf(key);
      if (!record || index < 0) return null;
      delete records[key];
      order.splice(index, 1);
      await write(records, order);
      return { record, index };
    },
    async restore(record: JobRecord, index: number): Promise<void> {
      const { records, order } = await readState();
      const key = buildStorageKey(record);
      records[key] = record;
      const previousIndex = order.indexOf(key);
      if (previousIndex >= 0) order.splice(previousIndex, 1);
      order.splice(Math.max(0, Math.min(index, order.length)), 0, key);
      await write(records, order);
    },
    async clear(): Promise<void> {
      await write({}, []);
    },
  };
}
```

- [ ] **Step 4: Run repository and CSV tests**

Run:

```bash
npx vitest run tests/storage/job-repository.test.ts tests/csv/serialize.test.ts
```

Expected: PASS. CSV column names and order remain unchanged.

- [ ] **Step 5: Commit ordered storage**

```bash
git add src/storage/job-repository.ts tests/storage/job-repository.test.ts
git commit -m "feat: add ordered job record mutations"
```

---

### Task 3: Build a fresh-extraction Side Panel controller

**Files:**
- Create: `src/sidepanel/extract-active-tab.ts`
- Create: `src/sidepanel/controller.ts`
- Create: `tests/sidepanel/controller.test.ts`

- [ ] **Step 1: Write failing controller tests for initialize, collect, duplicate, and export**

Use a mutable `records` array fake repository implementing the Task 2 interface. Add tests with these assertions:

```ts
it("loads stored rows without extracting on initialize", async () => {
  const extract = vi.fn();
  const render = vi.fn();
  const controller = createSidePanelController(deps({ extract, render, records: [sampleRecord] }));
  await controller.initialize();
  expect(extract).not.toHaveBeenCalled();
  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ records: [sampleRecord] }));
});

it("extracts the active tab on every collect click", async () => {
  const extract = vi.fn()
    .mockResolvedValueOnce(success(sampleRecord))
    .mockResolvedValueOnce(success({ ...sampleRecord, source_job_id: "2", job_title: "第二个岗位" }));
  const harness = deps({ extract });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.collect();
  await controller.collect();
  expect(extract).toHaveBeenCalledTimes(2);
  expect(harness.records.map((record) => record.source_job_id)).toEqual(["1", "2"]);
});

it("updates a duplicate in place and preserves its note", async () => {
  const old = { ...sampleRecord, note: "重点关注" };
  const updated = { ...sampleRecord, job_title: "更新后的岗位", note: "" };
  const harness = deps({ records: [old], extract: vi.fn().mockResolvedValue(success(updated)) });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.collect();
  expect(harness.records).toHaveLength(1);
  expect(harness.records[0]).toMatchObject({ job_title: "更新后的岗位", note: "重点关注" });
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    notice: { kind: "success", text: "已更新当前职位，没有新增重复记录" },
  }));
});

it.each([
  [{ kind: "unsupported-site" }, "请打开支持平台的职位详情页"],
  [{ kind: "not-detail-page", site: "boss" }, "请打开支持平台的职位详情页"],
])("keeps the list when collection is unavailable", async (page, message) => {
  const harness = deps({ records: [sampleRecord], extract: vi.fn().mockResolvedValue(page) });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.collect();
  expect(harness.records).toEqual([sampleRecord]);
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    records: [sampleRecord], notice: { kind: "error", text: message },
  }));
});

it("exports the latest ordered records without clearing", async () => {
  const download = vi.fn();
  const harness = deps({ records: [sampleRecord], download });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.exportCsv();
  expect(download).toHaveBeenCalledWith([sampleRecord]);
  expect(harness.records).toEqual([sampleRecord]);
});
```

The test helper `success(record)` must return the existing `PageResult` success shape, including empty `missingRequiredFields` and `diagnostics` arrays.

- [ ] **Step 2: Run controller tests and verify they fail**

Run:

```bash
npx vitest run tests/sidepanel/controller.test.ts
```

Expected: FAIL because the Side Panel controller and extraction bridge do not exist.

- [ ] **Step 3: Implement the controller state and fresh extraction bridge**

Define these public contracts in `src/sidepanel/controller.ts`:

```ts
import type { PageResult } from "../extractors";
import type { JobRecord } from "../shared/job-record";
import type { RemovedJob } from "../storage/job-repository";

export type Notice =
  | { kind: "success" | "error"; text: string }
  | { kind: "undo"; text: string };

export interface NoteEditorState { key: string; value: string }

export interface SidePanelState {
  records: JobRecord[];
  notice?: Notice;
  noteEditor?: NoteEditorState;
  clearConfirmOpen: boolean;
  busy: boolean;
}

export interface SidePanelRepository {
  save(record: JobRecord): Promise<void>;
  list(): Promise<JobRecord[]>;
  has(record: Pick<JobRecord, "source_site" | "source_job_id">): Promise<boolean>;
  updateNote(record: Pick<JobRecord, "source_site" | "source_job_id">, note: string): Promise<void>;
  remove(record: Pick<JobRecord, "source_site" | "source_job_id">): Promise<RemovedJob | null>;
  restore(record: JobRecord, index: number): Promise<void>;
  clear(): Promise<void>;
}
```

Implement `createSidePanelController` with one mutable state object, a `render()` snapshot, and an internal `reload()` that always obtains records from the repository. `initialize()` calls only `reload()`. `collect()` must call `deps.extract()` inside the method, branch on the existing `PageResult` union, call `repository.has()` before `save()`, and render the exact success/error strings from the Spec. On an extraction exception whose message contains `Cannot access`, `Missing host permission`, or `chrome://`, use `请在当前职位页再次点击扩展图标后重试`; otherwise use `无法读取当前页面，请打开职位详情后重试`.

Implement the standalone extraction bridge without cached module state:

```ts
// src/sidepanel/extract-active-tab.ts
import type { PageResult } from "../extractors";

export async function extractActiveTab(): Promise<PageResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { kind: "unsupported-site" };
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const key = "__JOB_COLLECTOR_RESULT__";
      const scope = globalThis as unknown as Record<string, unknown>;
      const result = scope[key];
      delete scope[key];
      return result;
    },
  });
  return (injection?.result as PageResult | undefined) ?? { kind: "unsupported-site" };
}
```

- [ ] **Step 4: Run controller and extraction regression tests**

Run:

```bash
npx vitest run tests/sidepanel/controller.test.ts tests/extractors/index.test.ts
```

Expected: PASS; every collect invocation uses the latest extraction result.

- [ ] **Step 5: Commit collection controller**

```bash
git add src/sidepanel/extract-active-tab.ts src/sidepanel/controller.ts tests/sidepanel/controller.test.ts
git commit -m "feat: collect current job from side panel"
```

---

### Task 4: Add notes, delete/undo, and clear state transitions

**Files:**
- Modify: `src/sidepanel/controller.ts`
- Modify: `tests/sidepanel/controller.test.ts`

- [ ] **Step 1: Add failing mutation and timer tests**

Use fake timers and add:

```ts
it("opens, trims, saves, and closes a note editor", async () => {
  const harness = deps({ records: [sampleRecord] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  controller.openNote(sampleRecord);
  await controller.saveNote("  重点关注\n已投递  ");
  expect(harness.records[0]?.note).toBe("重点关注\n已投递");
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    noteEditor: undefined,
    notice: { kind: "success", text: "备注已保存" },
  }));
});

it("rejects notes longer than 200 characters without changing storage", async () => {
  const harness = deps({ records: [sampleRecord] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  controller.openNote(sampleRecord);
  await controller.saveNote("字".repeat(201));
  expect(harness.records[0]?.note).toBe("");
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    notice: { kind: "error", text: "备注不能超过 200 个字符" },
  }));
});

it("deletes immediately and restores the record within five seconds", async () => {
  vi.useFakeTimers();
  const second = { ...sampleRecord, source_job_id: "2", job_title: "第二条" };
  const harness = deps({ records: [sampleRecord, second] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.deleteRecord(sampleRecord);
  expect(harness.records.map((record) => record.source_job_id)).toEqual(["2"]);
  await controller.undoDelete();
  expect(harness.records.map((record) => record.source_job_id)).toEqual(["1", "2"]);
  vi.useRealTimers();
});

it("expires undo after five seconds", async () => {
  vi.useFakeTimers();
  const harness = deps({ records: [sampleRecord] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.deleteRecord(sampleRecord);
  await vi.advanceTimersByTimeAsync(5_000);
  await controller.undoDelete();
  expect(harness.records).toEqual([]);
  vi.useRealTimers();
});

it("opens and cancels clear confirmation without mutation", async () => {
  const harness = deps({ records: [sampleRecord] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  controller.requestClear();
  controller.cancelClear();
  expect(harness.records).toEqual([sampleRecord]);
});

it("clears only after explicit confirmation", async () => {
  const harness = deps({ records: [sampleRecord] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  controller.requestClear();
  await controller.confirmClear();
  expect(harness.records).toEqual([]);
});

it("invalidates a pending single-row undo when all records are cleared", async () => {
  vi.useFakeTimers();
  const second = { ...sampleRecord, source_job_id: "2", job_title: "第二条" };
  const harness = deps({ records: [sampleRecord, second] });
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.deleteRecord(sampleRecord);
  controller.requestClear();
  await controller.confirmClear();
  await controller.undoDelete();
  expect(harness.records).toEqual([]);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run controller tests and verify the new cases fail**

Run:

```bash
npx vitest run tests/sidepanel/controller.test.ts
```

Expected: FAIL because note, delete/undo, and clear-dialog controller methods are missing.

- [ ] **Step 3: Implement the state transitions**

Add these methods to the controller return value:

```ts
openNote(record: JobRecord) {
  state.noteEditor = { key: `${record.source_site}:${record.source_job_id}`, value: record.note };
  render();
},
cancelNote() {
  state.noteEditor = undefined;
  render();
},
async saveNote(value: string) {
  const editor = state.noteEditor;
  if (!editor) return;
  const note = value.trim();
  if (note.length > 200) {
    state.notice = { kind: "error", text: "备注不能超过 200 个字符" };
    render();
    return;
  }
  const record = state.records.find((item) => `${item.source_site}:${item.source_job_id}` === editor.key);
  if (!record) return;
  try {
    await deps.repository.updateNote(record, note);
    state.noteEditor = undefined;
    state.notice = { kind: "success", text: "备注已保存" };
    await reload();
  } catch {
    state.notice = { kind: "error", text: "备注保存失败，请重试" };
    render();
  }
},
requestClear() {
  state.clearConfirmOpen = true;
  render();
},
cancelClear() {
  state.clearConfirmOpen = false;
  render();
},
async confirmClear() {
  try {
    clearPendingDelete();
    await deps.repository.clear();
    state.clearConfirmOpen = false;
    state.notice = { kind: "success", text: "已清空全部职位" };
    await reload();
  } catch {
    state.notice = { kind: "error", text: "清空失败，请重试" };
    render();
  }
}
```

Maintain one internal `pendingDelete: RemovedJob | null`, one timeout handle, and a `clearPendingDelete()` helper that cancels the timer and drops the snapshot. `deleteRecord()` must call `repository.remove()` first, save the returned snapshot, set the undo notice, refresh records, and schedule clearing `pendingDelete` and the undo notice after exactly `5_000` ms. A second delete calls `clearPendingDelete()` before replacing the pending snapshot. `undoDelete()` clears the timer, calls `repository.restore(record, index)`, clears the pending snapshot, and reloads. `confirmClear()` calls `clearPendingDelete()` before clearing storage so a prior row cannot be restored after “清空全部”. Expose an optional `dispose()` method that clears the timer when the panel unloads.

When `reload()` updates records, it must retain the current `notice`, `noteEditor`, and `clearConfirmOpen` values rather than resetting the whole state.

- [ ] **Step 4: Run the full controller suite**

Run:

```bash
npx vitest run tests/sidepanel/controller.test.ts
```

Expected: PASS with no pending fake timers.

- [ ] **Step 5: Commit row management behavior**

```bash
git add src/sidepanel/controller.ts tests/sidepanel/controller.test.ts
git commit -m "feat: manage side panel notes and deletions"
```

---

### Task 5: Render the compact accessible job list

**Files:**
- Create: `src/sidepanel/view.ts`
- Create: `tests/sidepanel/view.test.ts`
- Modify: `src/sidepanel/index.ts`

- [ ] **Step 1: Write failing renderer tests**

Add jsdom tests that call `renderSidePanel(root, state)` directly:

```ts
it("renders the requested columns and platform labels", () => {
  renderSidePanel(root, state([sampleRecord]));
  expect([...root.querySelectorAll("[role=columnheader]")].map((node) => node.textContent)).toEqual([
    "#", "平台", "公司", "职位", "薪资", "备注", "删除",
  ]);
  expect(root.querySelector("[data-field=platform]")?.textContent).toBe("BOSS");
});

it("stores full cell values for hover and keyboard tooltips", () => {
  const long = { ...sampleRecord, company_name: "很长的人工智能科技有限公司", note: "重点关注，等待招聘方回复" };
  renderSidePanel(root, state([long]));
  expect(root.querySelector("[data-field=company]")?.getAttribute("data-tooltip")).toBe(long.company_name);
  expect(root.querySelector("[data-field=title]")?.getAttribute("data-tooltip")).toBe(long.job_title);
  expect(root.querySelector("[data-field=note]")?.getAttribute("data-tooltip")).toBe(long.note);
  expect(root.querySelector("[data-field=company]")?.getAttribute("tabindex")).toBe("0");
});

it("renders empty fields and empty notes correctly", () => {
  renderSidePanel(root, state([{ ...sampleRecord, company_name: "", salary: "", note: "" }]));
  expect(root.querySelector("[data-field=company]")?.textContent).toBe("—");
  expect(root.querySelector("[data-field=company]")?.getAttribute("data-tooltip")).toBe("暂无信息");
  expect(root.querySelector("[data-action=open-note]")?.textContent).toBe("添加");
});

it("disables export and clear for an empty list", () => {
  renderSidePanel(root, state([]));
  expect(root.querySelector<HTMLButtonElement>("[data-action=export]")?.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>("[data-action=request-clear]")?.disabled).toBe(true);
});

it("renders the note dialog only when requested", () => {
  renderSidePanel(root, { ...state([sampleRecord]), noteEditor: { key: "boss:1", value: "重点" } });
  expect(root.querySelector("[data-dialog=note]")).not.toBeNull();
  expect(root.querySelector<HTMLTextAreaElement>("[data-note-input]")?.value).toBe("重点");
  expect(root.querySelector("[data-dialog=clear]")).toBeNull();
});

it("renders the clear dialog only when requested", () => {
  renderSidePanel(root, { ...state([sampleRecord]), clearConfirmOpen: true });
  expect(root.querySelector("[data-dialog=clear]")?.textContent).toContain("1 个职位");
  expect(root.querySelector("[data-dialog=note]")).toBeNull();
});
```

- [ ] **Step 2: Run renderer tests and verify they fail**

Run:

```bash
npx vitest run tests/sidepanel/view.test.ts
```

Expected: FAIL because `renderSidePanel` does not exist.

- [ ] **Step 3: Implement the safe DOM renderer**

Implement `renderSidePanel(root, state)` using `document.createElement` and `textContent`, never interpolating extracted job text into `innerHTML`.

Use this platform mapping:

```ts
const PLATFORM_LABELS = {
  boss: { short: "BOSS", full: "BOSS直聘" },
  liepin: { short: "猎聘", full: "猎聘" },
  zhaopin: { short: "智联", full: "智联招聘" },
  "51job": { short: "前程", full: "前程无忧" },
} as const;
```

For each record, render one `role="row"` with:

```text
two-digit index
platform short label with full label in data-tooltip
company_name or —
job_title or —
salary or —
note button showing 添加 or the note text
delete button with aria-label="删除：<job_title>"
```

Every data cell gets `class="cell truncate"`, `tabindex="0"`, `data-tooltip="<full value>"`, and a `data-field` name. The note button gets `data-action="open-note"` and the record key. The delete button gets `data-action="delete"` and the same key. The job title is plain text, not a navigation link.

Render the exact permanent structure from the Spec: product header, full-width collect button, count card, `aria-live="polite"` notice, scrollable table, and fixed export/clear footer. Render note and clear dialogs conditionally. The clear dialog must say `确定清空已收集的 N 个职位吗？此操作无法撤销。` and expose cancel/confirm buttons. After rendering an open dialog, queue focus to its textarea or least-destructive button.

- [ ] **Step 4: Run renderer tests**

Run:

```bash
npx vitest run tests/sidepanel/view.test.ts
```

Expected: PASS; extracted text is represented only through text nodes/attributes.

- [ ] **Step 5: Commit the renderer**

```bash
git add src/sidepanel/view.ts tests/sidepanel/view.test.ts
git commit -m "feat: render compact side panel job list"
```

---

### Task 6: Wire interactions, tooltips, dialogs, and keyboard behavior

**Files:**
- Modify: `src/sidepanel/index.ts`
- Modify: `tests/sidepanel/view.test.ts`

- [ ] **Step 1: Add failing interaction tests around an exported event binder**

Export `bindSidePanelEvents(root, controller)` from `src/sidepanel/index.ts` and add tests for delegated clicks and keys:

```ts
it("routes panel actions to the controller", () => {
  const controller = controllerMock();
  const unbind = bindSidePanelEvents(root, controller);
  root.innerHTML = `
    <button data-action="collect"></button>
    <button data-action="open-note" data-key="boss:1"></button>
    <button data-action="delete" data-key="boss:1"></button>
    <button data-action="undo-delete"></button>
    <button data-action="export"></button>
    <button data-action="request-clear"></button>`;
  root.querySelectorAll("button").forEach((button) => button.click());
  expect(controller.collect).toHaveBeenCalled();
  expect(controller.openNoteByKey).toHaveBeenCalledWith("boss:1");
  expect(controller.deleteByKey).toHaveBeenCalledWith("boss:1");
  expect(controller.undoDelete).toHaveBeenCalled();
  expect(controller.exportCsv).toHaveBeenCalled();
  expect(controller.requestClear).toHaveBeenCalled();
  unbind();
});

it("closes dialogs on Escape", () => {
  const controller = controllerMock();
  const unbind = bindSidePanelEvents(root, controller);
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(controller.cancelOverlay).toHaveBeenCalled();
  unbind();
});

it("shows one tooltip for pointer hover and keyboard focus", () => {
  const controller = controllerMock();
  const unbind = bindSidePanelEvents(root, controller);
  root.innerHTML = `<span tabindex="0" data-tooltip="完整公司名称">截断公司</span><div data-tooltip-popover hidden></div>`;
  const cell = root.querySelector<HTMLElement>("[data-tooltip]")!;
  cell.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(root.querySelector<HTMLElement>("[data-tooltip-popover]")?.textContent).toBe("完整公司名称");
  cell.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  expect(root.querySelector<HTMLElement>("[data-tooltip-popover]")?.hidden).toBe(true);
  unbind();
});
```

- [ ] **Step 2: Run the new interaction tests and verify they fail**

Run:

```bash
npx vitest run tests/sidepanel/view.test.ts
```

Expected: FAIL because the event binder and controller key helpers do not exist.

- [ ] **Step 3: Add key-based controller helpers and production event wiring**

Add `openNoteByKey(key)` and `deleteByKey(key)` methods that find the current record and delegate to the already tested record-based methods. Add `cancelOverlay()` that cancels the note editor first, otherwise cancels the clear dialog.

In `bindSidePanelEvents`, use one root `click` listener, one `submit` listener, `keydown` for Escape, `pointerover`/`pointerout`, and `focusin`/`focusout` for the shared tooltip. The tooltip position must be clamped to `document.documentElement.clientWidth` and `clientHeight`. Return an `unbind()` closure that removes every listener.

Wire production dependencies only after exports are defined:

```ts
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Side Panel root is missing");

const controller = createSidePanelController({
  extract: extractActiveTab,
  repository: createJobRepository(),
  download: exportJobs,
  render: (state) => renderSidePanel(root, state),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
});

const unbind = bindSidePanelEvents(root, controller);
globalThis.addEventListener("unload", () => {
  unbind();
  controller.dispose();
}, { once: true });

void controller.initialize();
```

Guard production bootstrap with `if (typeof chrome !== "undefined" && document.querySelector("#app"))` so importing the binder in jsdom does not access Chrome APIs.

- [ ] **Step 4: Run controller and view tests**

Run:

```bash
npx vitest run tests/sidepanel/controller.test.ts tests/sidepanel/view.test.ts
```

Expected: PASS, including mouse, focus, Escape, note submit, delete, undo, export, and clear routes.

- [ ] **Step 5: Commit interaction wiring**

```bash
git add src/sidepanel/index.ts src/sidepanel/controller.ts tests/sidepanel/controller.test.ts tests/sidepanel/view.test.ts
git commit -m "feat: wire side panel interactions"
```

---

### Task 7: Apply the approved compact violet visual system

**Files:**
- Modify: `src/sidepanel/styles.css`
- Modify: `tests/sidepanel/view.test.ts`

- [ ] **Step 1: Add structural class assertions before styling**

Add a renderer test that protects the fixed/scrolling layout contract:

```ts
it("keeps collection, list, and footer in separate layout regions", () => {
  renderSidePanel(root, state([sampleRecord]));
  expect(root.querySelector(".panel-collect")).not.toBeNull();
  expect(root.querySelector(".job-list-scroll")).not.toBeNull();
  expect(root.querySelector(".panel-footer")).not.toBeNull();
  expect(root.querySelector(".job-row")).not.toBeNull();
});
```

- [ ] **Step 2: Run the renderer test and verify it fails if class names are absent**

Run:

```bash
npx vitest run tests/sidepanel/view.test.ts
```

Expected: FAIL until the renderer contains the four agreed layout classes.

- [ ] **Step 3: Apply the CSS layout and visual tokens**

Use these exact tokens and structural rules as the starting stylesheet:

```css
:root {
  color: #fff;
  background: #16165c;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
html, body, #app { min-width: 320px; min-height: 100vh; margin: 0; }
button, textarea { font: inherit; }

.panel-shell {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  min-height: 100vh;
  padding: 16px;
  background: #16165c;
}

.panel-header, .panel-footer { display: flex; align-items: center; gap: 8px; }
.panel-header { justify-content: space-between; }
.panel-title { margin: 0; font-size: 18px; font-weight: 600; }
.panel-collect, .panel-footer button {
  min-height: 42px;
  border: 1px solid #4846c6;
  border-radius: 9999px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.panel-collect { width: 100%; border: 0; background: #5350cc; }
.panel-footer button { flex: 1; background: transparent; }
.panel-footer [data-action="export"] { background: #5350cc; }
button:disabled { cursor: not-allowed; opacity: .45; }
button:focus-visible, [data-tooltip]:focus-visible, textarea:focus-visible {
  outline: 2px solid #59b4ff;
  outline-offset: 2px;
}

.count-card, .job-list-scroll, .dialog-card {
  border: 1px solid #4846c6;
  background: #232269;
}
.count-card { padding: 14px 16px; border-radius: 16px; font-weight: 600; }
.job-list-scroll { min-height: 0; overflow-y: auto; overflow-x: hidden; border-radius: 16px; }
.job-grid { min-width: 0; }
.job-row {
  display: grid;
  grid-template-columns: 26px minmax(38px, .55fr) minmax(44px, .85fr) minmax(54px, 1.2fr) minmax(48px, .75fr) 44px 34px;
  gap: 5px;
  align-items: center;
  min-height: 54px;
  padding: 0 8px;
  border-bottom: 1px solid #4846c6;
  font-size: 12px;
}
.job-row:last-child { border-bottom: 0; }
.job-row--header { position: sticky; top: 0; z-index: 1; min-height: 40px; color: #b1a6f6; background: #232269; font-weight: 600; }
.truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-button, .delete-button { min-height: 30px; border: 0; border-radius: 7px; padding: 0 5px; }
.note-button { overflow: hidden; color: #d8d8e3; background: #403cd5; text-overflow: ellipsis; white-space: nowrap; }
.delete-button { color: #ff8e88; background: transparent; }
.notice { min-height: 18px; margin: 0; color: #59b4ff; font-size: 12px; }
.notice--error { color: #ff8e88; }

.tooltip-popover, .dialog-card {
  border-radius: 12px;
  color: #fff;
  background: #232269;
}
.tooltip-popover { position: fixed; z-index: 20; max-width: min(280px, calc(100vw - 24px)); padding: 9px 11px; pointer-events: none; }
.dialog-backdrop { position: fixed; z-index: 30; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(22, 22, 92, .78); }
.dialog-card { width: min(100%, 320px); padding: 16px; }
.dialog-card textarea { width: 100%; min-height: 96px; border: 1px solid #4846c6; border-radius: 16px; padding: 10px; color: #fff; background: #16165c; resize: vertical; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

@media (max-width: 359px) {
  .panel-shell { padding: 12px; }
  .job-row { grid-template-columns: 24px minmax(34px, .55fr) minmax(40px, .8fr) minmax(48px, 1fr) minmax(42px, .7fr) 40px 30px; gap: 3px; padding: 0 6px; }
}
```

Add only the minimal remaining selectors required by the actual renderer. Do not introduce a white theme, remote font, gradient, shadow, illustration, search, filter, tabs, or animation.

- [ ] **Step 4: Run typecheck and view tests**

Run:

```bash
npm run typecheck
npx vitest run tests/sidepanel/view.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit visual styling**

```bash
git add src/sidepanel/styles.css src/sidepanel/view.ts tests/sidepanel/view.test.ts
git commit -m "style: apply compact side panel layout"
```

---

### Task 8: Remove the obsolete Popup and update documentation

**Files:**
- Remove: `src/popup/index.html`
- Remove: `src/popup/index.ts`
- Remove: `src/popup/controller.ts`
- Remove: `src/popup/view.ts`
- Remove: `src/popup/styles.css`
- Remove: `tests/popup/controller.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Confirm no production or test imports still reference Popup**

Run:

```bash
rg -n "popup|createPopupController|renderPopup" src tests vite.config.ts README.md
```

Expected before cleanup: matches only in obsolete Popup files, its old test, and outdated README text. If Side Panel modules still import Popup code, move the shared extraction logic to `src/sidepanel/extract-active-tab.ts` before deletion.

- [ ] **Step 2: Delete obsolete Popup files with a patch**

Delete the six listed files. Do not delete `src/content`, `src/extractors`, `src/csv`, or shared storage/model modules.

- [ ] **Step 3: Update README usage and permissions**

Document this exact user flow:

```markdown
1. 打开 BOSS直聘、猎聘、智联招聘或前程无忧的职位详情页。
2. 在当前标签页点击 Chrome 工具栏中的“岗位收集器”，右侧面板会打开或聚焦。
3. 点击“收集当前职位”。切换到新标签页或另一个平台后，先在该页再次点击扩展图标授权。
4. 在列表中 Hover 或键盘聚焦字段可查看完整内容；可编辑备注或删除单条记录。
5. 点击“导出 CSV”下载全部完整岗位信息。
```

Update the permissions section to list only `activeTab`, `scripting`, `storage`, and `sidePanel`, explaining that no persistent site access is requested. State that deleting one row offers 5-second undo, while clearing all requires confirmation and cannot be undone.

- [ ] **Step 4: Run the full automated suite and build**

Run:

```bash
npm test
npm run build
rg -n "popup|default_popup" src tests dist README.md
```

Expected: tests and build exit 0; the final search returns no obsolete Popup/default-popup references; all four extractor suites and CSV serialization tests still pass.

- [ ] **Step 5: Commit cleanup and docs**

```bash
git add -A src/popup tests/popup README.md
git commit -m "docs: update side panel usage"
```

---

### Task 9: Perform final build and real Chrome acceptance

**Files:**
- Verify only; modify the smallest responsible file if an acceptance defect is found.

- [ ] **Step 1: Run clean verification before claiming completion**

Run:

```bash
npm run typecheck
npm test
npm run build
git diff --check
git status --short
```

Expected: typecheck, tests, build, and diff check exit 0. Working tree is clean before manual Chrome testing.

- [ ] **Step 2: Inspect generated extension artifacts**

Run:

```bash
node -e 'const m=require("./dist/manifest.json"); console.log(JSON.stringify({permissions:m.permissions, action:m.action, background:m.background, side_panel:m.side_panel}, null, 2))'
test -f dist/background.js
test -f dist/sidepanel/index.html
test -f dist/content.js
```

Expected: only the four approved permissions; no `default_popup` or `host_permissions`; all three artifacts exist.

- [ ] **Step 3: Reload `dist/` in Chrome and execute the Spec acceptance path**

Verify, in order:

1. Toolbar click opens the native right Side Panel.
2. Collect one real job from each supported platform.
3. Keep the panel open and change jobs within the same platform; the next click collects the latest page.
4. Switch tabs/platforms, click the toolbar icon again, and collect successfully.
5. Hover and keyboard-focus platform, company, title, salary, and note cells; full values remain in bounds.
6. Add a multiline note, update the same job, and confirm the note survives.
7. Delete one row and undo within 5 seconds; delete again and let undo expire.
8. Cancel clear via button and Escape; then confirm clear only after re-collecting a disposable record.
9. Export CSV and verify 16 columns, BOM, CRLF, full JD, stable row order, and saved note.

- [ ] **Step 4: Fix only observed defects using a red-green cycle**

For each defect: add a focused failing Vitest case, run it to confirm failure, make the smallest production change, rerun the focused test, then rerun `npm test && npm run build`. Do not add unplanned features during acceptance.

- [ ] **Step 5: Commit any acceptance fix separately**

If fixes were required:

```bash
git add <exact-tested-files>
git commit -m "fix: resolve side panel acceptance issue"
```

If no fixes were required, do not create an empty commit.

---

## Plan self-review result

- Spec coverage: Side Panel shell, minimal permission model, current-tab extraction, seven list columns, stable ordering, Hover/focus detail, notes, duplicate preservation, delete/undo, clear confirmation, CSV export, compatibility migration, accessibility, tests, build, and real Chrome acceptance are each assigned to a task.
- Scope control: no crawler, automatic collection, persistent host access, AI feature, backend, search, filter, tag, or job navigation was added.
- Placeholder scan: no `TBD`, deferred implementation, or unspecified error-handling step remains.
- Type consistency: storage identity is consistently `source_site + source_job_id`; controller, renderer, and event binder use the same stable record key; `note` remains part of the existing `JobRecord` and CSV schema.
