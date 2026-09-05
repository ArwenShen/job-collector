# Per-Platform Optional Host Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users authorize each supported recruitment platform once from an already-open Side Panel, then collect from that platform’s new tabs without reopening the extension.

**Architecture:** Keep `activeTab` as the zero-prompt fast path, convert supported-host injection failures into a structured error, and add a Side Panel host-access coordinator around Chrome 133’s `permissions.addHostAccessRequest`. The coordinator owns one pending tab request and lifecycle invalidation; the controller owns user feedback, one-shot retry, and existing save semantics.

**Tech Stack:** Chrome Manifest V3, TypeScript, Vitest, JSDOM, Vite

---

### Task 1: Declare Exact Optional Platform Permissions

**Files:**
- Modify: `tests/manifest.test.ts`
- Modify: `src/public/manifest.json`

- [ ] **Step 1: Write the failing Manifest contract**

Add these assertions after the required-permissions assertion in `tests/manifest.test.ts`:

```ts
expect(manifest.optional_host_permissions).toEqual([
  "https://*.zhipin.com/*",
  "https://*.liepin.com/*",
  "https://*.zhaopin.com/*",
  "https://*.51job.com/*",
]);
expect(manifest).not.toHaveProperty("host_permissions");
expect(manifest.permissions).not.toContain("tabs");
expect(JSON.stringify(manifest.optional_host_permissions)).not.toMatch(
  /<all_urls>|https:\/\/\*\/\*|http:\/\/\*\/\*/,
);
```

Keep the existing action, Side Panel, background and version assertions.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/manifest.test.ts`

Expected: FAIL because `optional_host_permissions` is currently absent.

- [ ] **Step 3: Add only the four optional HTTPS host patterns**

Update `src/public/manifest.json` to:

```json
{
  "manifest_version": 3,
  "name": "岗位收集器",
  "description": "收集当前职位详情并导出为 CSV。",
  "version": "0.2.0",
  "permissions": ["activeTab", "scripting", "storage", "sidePanel"],
  "optional_host_permissions": [
    "https://*.zhipin.com/*",
    "https://*.liepin.com/*",
    "https://*.zhaopin.com/*",
    "https://*.51job.com/*"
  ],
  "action": {
    "default_title": "岗位收集器"
  },
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/manifest.test.ts`

Expected: 1 test file passes.

```bash
git add src/public/manifest.json tests/manifest.test.ts
git commit -m "feat: declare optional recruitment site access"
```

---

### Task 2: Return a Structured Supported-Host Access Error

**Files:**
- Create: `tests/sidepanel/extract-active-tab.test.ts`
- Modify: `src/sidepanel/extract-active-tab.ts`

- [ ] **Step 1: Write failing extraction-boundary tests**

Create `tests/sidepanel/extract-active-tab.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractActiveTab,
  HostAccessRequiredError,
} from "../../src/sidepanel/extract-active-tab";

afterEach(() => vi.unstubAllGlobals());

function chromeWith(error: Error) {
  return {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 17 }]) },
    scripting: { executeScript: vi.fn().mockRejectedValue(error) },
  };
}

describe("active-tab host access boundary", () => {
  it.each([
    "https://www.zhipin.com/job_detail/1.html",
    "https://www.liepin.com/job/1.shtml",
    "https://www.zhaopin.com/jobdetail/1.htm",
    "https://jobs.51job.com/shanghai/1.html",
  ])("returns the tab id in a structured error for supported host %s", async (url) => {
    vi.stubGlobal("chrome", chromeWith(new Error(
      `Cannot access contents of url "${url}". Extension manifest must request permission.`,
    )));

    await expect(extractActiveTab()).rejects.toMatchObject({
      name: "HostAccessRequiredError",
      tabId: 17,
    });
  });

  it.each([
    'Cannot access contents of url "https://example.com/". Extension manifest must request permission.',
    'Cannot access contents of url "chrome://settings/"',
    "tab disappeared",
  ])("does not request host access for unrelated failure: %s", async (message) => {
    const error = new Error(message);
    vi.stubGlobal("chrome", chromeWith(error));
    await expect(extractActiveTab()).rejects.toBe(error);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/sidepanel/extract-active-tab.test.ts`

Expected: FAIL because `HostAccessRequiredError` does not exist.

- [ ] **Step 3: Implement supported-host classification at the Chrome boundary**

Replace `src/sidepanel/extract-active-tab.ts` with:

```ts
import type { PageResult } from "../extractors";

const SUPPORTED_HOSTS = ["zhipin.com", "liepin.com", "zhaopin.com", "51job.com"];

export class HostAccessRequiredError extends Error {
  readonly tabId: number;

  constructor(tabId: number, cause: unknown) {
    super("Host access required", { cause });
    this.name = "HostAccessRequiredError";
    this.tabId = tabId;
  }
}

function deniedSupportedHost(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Cannot access contents of url")
    && !message.includes("Missing host permission")) return false;
  const candidate = message.match(/https:\/\/[^"'\s]+/)?.[0];
  if (!candidate) return false;
  try {
    const hostname = new URL(candidate).hostname;
    return SUPPORTED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export async function extractActiveTab(): Promise<PageResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { kind: "unsupported-site" };

  try {
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
  } catch (error) {
    if (deniedSupportedHost(error)) throw new HostAccessRequiredError(tab.id, error);
    throw error;
  }
}
```

This is the only layer allowed to interpret Chrome’s injection error string. The controller will use the error class and must not inspect hostnames or raw messages.

- [ ] **Step 4: Verify focused and existing extraction tests**

Run: `npm test -- tests/sidepanel/extract-active-tab.test.ts tests/sidepanel/controller.test.ts`

Expected: both files pass, including the existing fresh extraction tests.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/extract-active-tab.ts tests/sidepanel/extract-active-tab.test.ts
git commit -m "refactor: classify supported host access failures"
```

---

### Task 3: Coordinate One Pending Chrome Host-Access Request

**Files:**
- Create: `src/sidepanel/host-access.ts`
- Create: `tests/sidepanel/host-access.test.ts`

- [ ] **Step 1: Write the failing coordinator tests**

Create `tests/sidepanel/host-access.test.ts` with a local event stub and these behaviors:

```ts
import { describe, expect, it, vi } from "vitest";
import { createHostAccessCoordinator } from "../../src/sidepanel/host-access";

function event<T extends (...args: any[]) => void>() {
  const listeners = new Set<T>();
  return {
    addListener: vi.fn((listener: T) => listeners.add(listener)),
    removeListener: vi.fn((listener: T) => listeners.delete(listener)),
    emit: (...args: Parameters<T>) => listeners.forEach((listener) => listener(...args)),
  };
}

function harness(withRequest = true) {
  const onAdded = event<(permissions: { origins?: string[] }) => void>();
  const onActivated = event<(info: { tabId: number }) => void>();
  const onRemoved = event<(tabId: number) => void>();
  const onUpdated = event<(tabId: number, info: { status?: string }) => void>();
  const addHostAccessRequest = withRequest ? vi.fn().mockResolvedValue(undefined) : undefined;
  const coordinator = createHostAccessCoordinator(
    { addHostAccessRequest, onAdded },
    { onActivated, onRemoved, onUpdated },
  );
  return { coordinator, addHostAccessRequest, onAdded, onActivated, onRemoved, onUpdated };
}

describe("host access coordinator", () => {
  it("requests access for the current tab and emits one valid grant", async () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);

    await expect(h.coordinator.request(21)).resolves.toBe("requested");
    expect(h.addHostAccessRequest).toHaveBeenCalledWith({ tabId: 21 });
    h.onAdded.emit({ origins: ["https://www.liepin.com/*"] });
    h.onAdded.emit({ origins: ["https://www.liepin.com/*"] });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ kind: "granted", tabId: 21 });
  });

  it.each(["activated", "removed", "updated"] as const)(
    "marks the pending collection stale when the tab is %s",
    async (cause) => {
      const h = harness();
      const listener = vi.fn();
      h.coordinator.subscribe(listener);
      await h.coordinator.request(21);
      if (cause === "activated") h.onActivated.emit({ tabId: 22 });
      if (cause === "removed") h.onRemoved.emit(21);
      if (cause === "updated") h.onUpdated.emit(21, { status: "loading" });
      h.onAdded.emit({ origins: ["https://www.zhaopin.com/*"] });
      expect(listener).toHaveBeenCalledWith({ kind: "stale", tabId: 21 });
    },
  );

  it("replaces an older pending request and ignores events without origins", async () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);
    await h.coordinator.request(21);
    await h.coordinator.request(22);
    h.onAdded.emit({});
    expect(listener).not.toHaveBeenCalled();
    h.onAdded.emit({ origins: ["https://www.51job.com/*"] });
    expect(listener).toHaveBeenCalledWith({ kind: "granted", tabId: 22 });
  });

  it("falls back when the API is unavailable or rejects", async () => {
    const missing = harness(false);
    await expect(missing.coordinator.request(21)).resolves.toBe("unavailable");

    const rejected = harness();
    rejected.addHostAccessRequest?.mockRejectedValueOnce(new Error("not eligible"));
    await expect(rejected.coordinator.request(22)).resolves.toBe("unavailable");
  });

  it("removes Chrome listeners and stops publishing on dispose", () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);
    h.coordinator.dispose();
    expect(h.onAdded.removeListener).toHaveBeenCalledOnce();
    expect(h.onActivated.removeListener).toHaveBeenCalledOnce();
    expect(h.onRemoved.removeListener).toHaveBeenCalledOnce();
    expect(h.onUpdated.removeListener).toHaveBeenCalledOnce();
    h.onAdded.emit({ origins: ["https://www.liepin.com/*"] });
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/sidepanel/host-access.test.ts`

Expected: FAIL because the coordinator module does not exist.

- [ ] **Step 3: Implement the coordinator as a complete isolated module**

Create `src/sidepanel/host-access.ts`:

```ts
export type HostAccessRequestStatus = "requested" | "unavailable";
export type HostAccessEvent =
  | { kind: "granted"; tabId: number }
  | { kind: "stale"; tabId: number };

interface ChromeEvent<T extends (...args: any[]) => void> {
  addListener(listener: T): void;
  removeListener(listener: T): void;
}

interface PermissionsApi {
  addHostAccessRequest?: (request: { tabId: number }) => Promise<void>;
  onAdded: ChromeEvent<(permissions: { origins?: string[] }) => void>;
}

interface TabsApi {
  onActivated: ChromeEvent<(info: { tabId: number }) => void>;
  onRemoved: ChromeEvent<(tabId: number, ...rest: any[]) => void>;
  onUpdated: ChromeEvent<(tabId: number, info: { status?: string }, ...rest: any[]) => void>;
}

export interface HostAccessCoordinator {
  request(tabId: number): Promise<HostAccessRequestStatus>;
  subscribe(listener: (event: HostAccessEvent) => void): () => void;
  dispose(): void;
}

export function createHostAccessCoordinator(
  permissions: PermissionsApi,
  tabs: TabsApi,
): HostAccessCoordinator {
  let pending: { tabId: number; stale: boolean } | undefined;
  let disposed = false;
  const subscribers = new Set<(event: HostAccessEvent) => void>();

  const markStale = (tabId: number) => {
    if (pending?.tabId === tabId) pending.stale = true;
  };
  const onActivated = ({ tabId }: { tabId: number }) => {
    if (pending && pending.tabId !== tabId) pending.stale = true;
  };
  const onRemoved = (tabId: number) => markStale(tabId);
  const onUpdated = (tabId: number, info: { status?: string }) => {
    if (info.status === "loading") markStale(tabId);
  };
  const onAdded = (grant: { origins?: string[] }) => {
    if (!pending || !grant.origins?.length) return;
    const current = pending;
    pending = undefined;
    const event: HostAccessEvent = current.stale
      ? { kind: "stale", tabId: current.tabId }
      : { kind: "granted", tabId: current.tabId };
    for (const subscriber of subscribers) subscriber(event);
  };

  permissions.onAdded.addListener(onAdded);
  tabs.onActivated.addListener(onActivated);
  tabs.onRemoved.addListener(onRemoved);
  tabs.onUpdated.addListener(onUpdated);

  return {
    async request(tabId) {
      const current = { tabId, stale: false };
      pending = current;
      if (disposed || !permissions.addHostAccessRequest) {
        if (pending === current) pending = undefined;
        return "unavailable";
      }
      try {
        await permissions.addHostAccessRequest({ tabId });
        return "requested";
      } catch {
        if (pending === current) pending = undefined;
        return "unavailable";
      }
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = undefined;
      subscribers.clear();
      permissions.onAdded.removeListener(onAdded);
      tabs.onActivated.removeListener(onActivated);
      tabs.onRemoved.removeListener(onRemoved);
      tabs.onUpdated.removeListener(onUpdated);
    },
  };
}
```

Use the narrow interfaces above so the coordinator can be tested without a global Chrome mock. If the real Chrome overloads require it, widen only the trailing event parameters while preserving the fields used by the coordinator.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/sidepanel/host-access.test.ts`

Expected: all coordinator tests pass.

```bash
git add src/sidepanel/host-access.ts tests/sidepanel/host-access.test.ts
git commit -m "feat: coordinate per-tab host access"
```

---

### Task 4: Request Permission and Retry Collection Once

**Files:**
- Modify: `src/sidepanel/controller.ts`
- Modify: `tests/sidepanel/controller.test.ts`

- [ ] **Step 1: Extend the controller harness and write failing behavior tests**

Import the new boundary and event types:

```ts
import { HostAccessRequiredError } from "../../src/sidepanel/extract-active-tab";
import type {
  HostAccessCoordinator,
  HostAccessEvent,
} from "../../src/sidepanel/host-access";
```

Extend `createHarness` options and its returned dependency object with:

```ts
hostAccess?: Pick<HostAccessCoordinator, "request">;
```

```ts
hostAccess: options.hostAccess,
```

Then add these tests:

```ts
it.each<PageResult>([
  success(sampleRecord),
  { kind: "unsupported-site" },
])("does not request access when extraction returns a page result", async (page) => {
  const request = vi.fn().mockResolvedValue("requested");
  const controller = createSidePanelController(createHarness({
    extract: vi.fn().mockResolvedValue(page),
    hostAccess: { request },
  }));
  await controller.collect();
  expect(request).not.toHaveBeenCalled();
});

it("requests current-site access and keeps collect usable", async () => {
  const request = vi.fn().mockResolvedValue("requested");
  const harness = createHarness({
    extract: vi.fn().mockRejectedValue(new HostAccessRequiredError(17, new Error("denied"))),
    hostAccess: { request },
  });
  const controller = createSidePanelController(harness);
  await controller.collect();
  expect(request).toHaveBeenCalledWith(17);
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    busy: false,
    notice: { kind: "info", text: "请在浏览器工具栏允许访问当前招聘网站" },
  }));
});

it("uses the activeTab fallback when host access cannot be requested", async () => {
  const harness = createHarness({
    extract: vi.fn().mockRejectedValue(new HostAccessRequiredError(17, new Error("denied"))),
    hostAccess: { request: vi.fn().mockResolvedValue("unavailable") },
  });
  const controller = createSidePanelController(harness);
  await controller.collect();
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    notice: { kind: "error", text: "请在当前职位页再次点击扩展图标后重试" },
  }));
});

it("retries a granted pending collection once and saves once", async () => {
  const extract = vi.fn()
    .mockRejectedValueOnce(new HostAccessRequiredError(17, new Error("denied")))
    .mockResolvedValueOnce(success(sampleRecord));
  const harness = createHarness({
    extract,
    hostAccess: { request: vi.fn().mockResolvedValue("requested") },
  });
  const controller = createSidePanelController(harness);
  await controller.collect();
  await controller.hostAccessChanged({ kind: "granted", tabId: 17 });
  expect(extract).toHaveBeenCalledTimes(2);
  expect(harness.records).toHaveLength(1);
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    notice: { kind: "success", text: "已收集当前职位" },
  }));
});

it("does not retry a stale permission grant", async () => {
  const extract = vi.fn().mockRejectedValue(
    new HostAccessRequiredError(17, new Error("denied")),
  );
  const harness = createHarness({
    extract,
    hostAccess: { request: vi.fn().mockResolvedValue("requested") },
  });
  const controller = createSidePanelController(harness);
  await controller.collect();
  await controller.hostAccessChanged({ kind: "stale", tabId: 17 });
  expect(extract).toHaveBeenCalledOnce();
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    notice: { kind: "info", text: "网站访问已授权，请回到职位页重新收集" },
  }));
});

it("does not enter an authorization loop after the automatic retry", async () => {
  const request = vi.fn().mockResolvedValue("requested");
  const extract = vi.fn().mockRejectedValue(new HostAccessRequiredError(17, new Error("denied")));
  const controller = createSidePanelController(createHarness({ extract, hostAccess: { request } }));
  await controller.collect();
  await controller.hostAccessChanged({ kind: "granted", tabId: 17 });
  expect(request).toHaveBeenCalledOnce();
  expect(extract).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the focused controller tests and verify RED**

Run: `npm test -- tests/sidepanel/controller.test.ts`

Expected: FAIL because the controller has no host-access dependency, `info` notice, or grant callback.

- [ ] **Step 3: Add the controller contract and one-shot collection path**

Update the imports and public types in `src/sidepanel/controller.ts`:

```ts
import { HostAccessRequiredError } from "./extract-active-tab";
import type {
  HostAccessCoordinator,
  HostAccessEvent,
} from "./host-access";

export type Notice =
  | { kind: "info" | "success" | "error"; text: string }
  | { kind: "undo"; text: string };
```

Insert this method immediately after `collect()` in the existing `SidePanelController` interface:

```ts
hostAccessChanged(event: HostAccessEvent): Promise<void>;
```

Add the dependency:

```ts
hostAccess?: Pick<HostAccessCoordinator, "request">;
```

Extract the existing `collect()` body into `async function collectCurrent(allowHostRequest: boolean)`. Replace its inner extraction catch with:

```ts
} catch (error) {
  if (disposed) return;
  if (error instanceof HostAccessRequiredError) {
    const status = allowHostRequest && deps.hostAccess
      ? await deps.hostAccess.request(error.tabId)
      : "unavailable";
    if (disposed) return;
    setNotice(status === "requested"
      ? { kind: "info", text: "请在浏览器工具栏允许访问当前招聘网站" }
      : { kind: "error", text: "请在当前职位页再次点击扩展图标后重试" });
    return;
  }
  setNotice({
    kind: "error",
    text: "无法读取当前页面，请打开职位详情后重试",
  });
  return;
}
```

Remove `extractionErrorMessage`; raw Chrome messages must not reach the business controller.

Update the existing raw-error table so all four unstructured errors expect the generic message:

```ts
it.each([
  "Cannot access contents of url",
  "Missing host permission",
  "Cannot inject into chrome://settings",
  "tab disappeared",
])("maps unstructured extraction error %s without losing rows", async (message) => {
  const harness = createHarness({
    records: [sampleRecord],
    extract: vi.fn().mockRejectedValue(new Error(message)),
  });
  const save = vi.spyOn(harness.repository, "save");
  const controller = createSidePanelController(harness);
  await controller.initialize();
  await controller.collect();
  expect(save).not.toHaveBeenCalled();
  expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
    records: [sampleRecord],
    notice: { kind: "error", text: "无法读取当前页面，请打开职位详情后重试" },
    busy: false,
  }));
});
```

Expose these two methods in the returned object:

```ts
collect(): Promise<void> {
  return collectCurrent(true);
},

hostAccessChanged(event: HostAccessEvent): Promise<void> {
  if (disposed) return Promise.resolve();
  if (event.kind === "stale") {
    setNotice({
      kind: "info",
      text: "网站访问已授权，请回到职位页重新收集",
    });
    render();
    return Promise.resolve();
  }
  return collectCurrent(false);
},
```

Do not change validation, repository writes, duplicate handling, list refresh or `finally` busy-state cleanup in the moved collection body.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npm test -- tests/sidepanel/controller.test.ts tests/sidepanel/view.test.ts`

Expected: both files pass. Info notices use the existing cyan notice style because only `error` adds the danger class.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/controller.ts tests/sidepanel/controller.test.ts
git commit -m "feat: retry collection after host grant"
```

---

### Task 5: Wire Chrome Permission Events into the Side Panel Lifecycle

**Files:**
- Modify: `src/sidepanel/index.ts`
- Modify: `tests/sidepanel/index.test.ts`

- [ ] **Step 1: Write the failing bootstrap lifecycle test**

Add `hostAccessChanged: vi.fn(async () => undefined)` to the `createController()` test helper. Import `HostAccessCoordinator` and `HostAccessEvent`, then add:

```ts
it("routes host grants to the controller and disposes the coordinator once", async () => {
  const controller = createController();
  let listener: ((event: HostAccessEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const hostAccess: HostAccessCoordinator = {
    request: vi.fn().mockResolvedValue("requested"),
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    dispose: vi.fn(),
  };
  const cleanup = bootstrapSidePanel({
    root,
    repository,
    createController: vi.fn(() => controller),
    hostAccess,
  });

  listener?.({ kind: "granted", tabId: 17 });
  await Promise.resolve();
  expect(controller.hostAccessChanged).toHaveBeenCalledWith({ kind: "granted", tabId: 17 });

  cleanup();
  cleanup();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(hostAccess.dispose).toHaveBeenCalledOnce();
});
```

Also assert in the existing dependency-capture bootstrap test:

```ts
expect(deps?.hostAccess).toBeDefined();
```

- [ ] **Step 2: Run the focused bootstrap tests and verify RED**

Run: `npm test -- tests/sidepanel/index.test.ts`

Expected: FAIL because bootstrap does not create, inject, subscribe or dispose a coordinator.

- [ ] **Step 3: Wire the coordinator without changing UI event bindings**

Add imports:

```ts
import {
  createHostAccessCoordinator,
  type HostAccessCoordinator,
} from "./host-access";
```

Extend bootstrap options:

```ts
hostAccess?: HostAccessCoordinator;
```

At bootstrap, before creating the controller:

```ts
const hostAccess = options.hostAccess
  ?? createHostAccessCoordinator(chrome.permissions, chrome.tabs);
```

Pass `hostAccess` into `createSidePanelController`, then subscribe after controller creation:

```ts
const unsubscribeHostAccess = hostAccess.subscribe((event) => {
  runAction(controller.hostAccessChanged(event));
});
```

Add to the existing idempotent cleanup, before `controller.dispose()`:

```ts
unsubscribeHostAccess();
hostAccess.dispose();
```

Do not require `addHostAccessRequest` in `shouldBootstrap`; the controller fallback must remain available on Chrome versions older than 133.

- [ ] **Step 4: Run focused and full Side Panel tests**

Run: `npm test -- tests/sidepanel/index.test.ts tests/sidepanel/host-access.test.ts tests/sidepanel/controller.test.ts`

Expected: all three files pass with no unhandled promise errors.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/index.ts tests/sidepanel/index.test.ts
git commit -m "feat: wire host access lifecycle"
```

---

### Task 6: Update User Documentation and Build the Extension

**Files:**
- Modify: `README.md`
- Verify/generated: `dist/`

- [ ] **Step 1: Update the usage instructions**

Replace README usage step 3 with:

```markdown
3. 点击“收集当前职位”。如果该平台尚未获得网站访问权限，请在 Chrome 官方权限入口允许访问；授权后插件会自动继续收集。每个平台只需授权一次，之后该平台的新职位标签页可以直接收集。BOSS 收藏列表在同一标签页内切换职位时通常不需要额外授权。
```

Replace the privacy paragraph with:

```markdown
数据仅在浏览器本地处理和保存。扩展不发送网络请求，不读取未被用户主动打开的岗位。扩展保留 `activeTab`、`scripting`、`storage` 和 `sidePanel` 必需权限，并仅为 BOSS直聘、猎聘、智联招聘和前程无忧声明按平台运行时授予的可选网站权限；不申请所有网站访问权限。即使用户授予某个平台权限，插件也只会在用户点击“收集当前职位”时读取当前激活页。
```

- [ ] **Step 2: Run full automated verification**

Run: `npm run build && git diff --check`

Expected:

- TypeScript succeeds.
- Every Vitest file passes.
- Side Panel/background and content-script Vite builds succeed.
- `dist/manifest.json` contains the four optional hosts and no fixed `host_permissions`.
- No whitespace errors are reported.

- [ ] **Step 3: Inspect the generated permission boundary**

Run:

```bash
node -e 'const m=require("./dist/manifest.json"); console.log(JSON.stringify({permissions:m.permissions,optional_host_permissions:m.optional_host_permissions,host_permissions:m.host_permissions},null,2))'
```

Expected: four existing required permissions, exactly four optional HTTPS platform patterns, and omitted `host_permissions`.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain per-platform site access"
```

- [ ] **Step 5: Perform real Chrome acceptance**

Reload `dist/` at `chrome://extensions`, then execute all ten acceptance cases in `docs/superpowers/specs/2026-09-05-per-platform-optional-host-access-design.md` section 10. Record the observed Chrome permission presentation because Chrome controls whether the request appears beside the toolbar icon or in the extensions menu.

Do not push or merge until automated verification passes and the user confirms the real-browser result.
