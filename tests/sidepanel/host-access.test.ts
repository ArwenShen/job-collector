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
