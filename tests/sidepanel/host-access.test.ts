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

function harness(withRequest = true, withRemove = true) {
  const onAdded = event<(permissions: { origins?: string[] }) => void>();
  const onActivated = event<(info: { tabId: number }) => void>();
  const onRemoved = event<(tabId: number) => void>();
  const onUpdated = event<(tabId: number, info: { status?: string }) => void>();
  const addHostAccessRequest = withRequest ? vi.fn().mockResolvedValue(undefined) : undefined;
  const removeHostAccessRequest = withRemove ? vi.fn().mockResolvedValue(undefined) : undefined;
  const coordinator = createHostAccessCoordinator(
    { addHostAccessRequest, removeHostAccessRequest, onAdded },
    { onActivated, onRemoved, onUpdated },
  );
  return {
    coordinator,
    addHostAccessRequest,
    removeHostAccessRequest,
    onAdded,
    onActivated,
    onRemoved,
    onUpdated,
  };
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
    "retains a stale guard when cancellation is unavailable and the tab is %s",
    async (cause) => {
      const h = harness(true, false);
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

  it("cancels an older pending request before registering its replacement", async () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);
    await h.coordinator.request(21);
    await h.coordinator.request(22);

    expect(h.removeHostAccessRequest).toHaveBeenCalledWith({ tabId: 21 });
    expect(h.removeHostAccessRequest!.mock.invocationCallOrder[0]).toBeLessThan(
      h.addHostAccessRequest!.mock.invocationCallOrder[1]!,
    );
    h.onAdded.emit({});
    expect(listener).not.toHaveBeenCalled();
  });

  it.each(["activated", "removed", "updated"] as const)(
    "cancels a pending Chrome request when the tab becomes %s",
    async (cause) => {
      const h = harness();
      const listener = vi.fn();
      h.coordinator.subscribe(listener);
      await h.coordinator.request(21);
      if (cause === "activated") h.onActivated.emit({ tabId: 22 });
      if (cause === "removed") h.onRemoved.emit(21);
      if (cause === "updated") h.onUpdated.emit(21, { status: "loading" });

      await vi.waitFor(() => {
        expect(h.removeHostAccessRequest).toHaveBeenCalledWith({ tabId: 21 });
      });
      h.onAdded.emit({ origins: ["https://www.zhaopin.com/*"] });
      expect(listener).not.toHaveBeenCalled();
    },
  );

  it("keeps a stale guard when cancelling the Chrome request fails", async () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);
    h.removeHostAccessRequest?.mockRejectedValueOnce(new Error("remove failed"));
    await h.coordinator.request(21);
    h.onActivated.emit({ tabId: 22 });
    await vi.waitFor(() => expect(h.removeHostAccessRequest).toHaveBeenCalledOnce());

    h.onAdded.emit({ origins: ["https://www.zhaopin.com/*"] });
    expect(listener).toHaveBeenCalledWith({ kind: "stale", tabId: 21 });
  });

  it("ignores permission events outside the declared recruitment platforms", async () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);
    await h.coordinator.request(21);

    h.onAdded.emit({ origins: ["https://example.com/*"] });
    expect(listener).not.toHaveBeenCalled();
    h.onAdded.emit({ origins: ["https://www.liepin.com/*"] });
    expect(listener).toHaveBeenCalledWith({ kind: "granted", tabId: 21 });
  });

  it("falls back when the API is unavailable or rejects", async () => {
    const missing = harness(false);
    await expect(missing.coordinator.request(21)).resolves.toBe("unavailable");

    const rejected = harness();
    rejected.addHostAccessRequest?.mockRejectedValueOnce(new Error("not eligible"));
    await expect(rejected.coordinator.request(22)).resolves.toBe("unavailable");
  });

  it("cancels pending access, removes Chrome listeners and stops publishing on dispose", async () => {
    const h = harness();
    const listener = vi.fn();
    h.coordinator.subscribe(listener);
    await h.coordinator.request(21);
    h.coordinator.dispose();
    expect(h.removeHostAccessRequest).toHaveBeenCalledWith({ tabId: 21 });
    expect(h.onAdded.removeListener).toHaveBeenCalledOnce();
    expect(h.onActivated.removeListener).toHaveBeenCalledOnce();
    expect(h.onRemoved.removeListener).toHaveBeenCalledOnce();
    expect(h.onUpdated.removeListener).toHaveBeenCalledOnce();
    h.onAdded.emit({ origins: ["https://www.liepin.com/*"] });
    expect(listener).not.toHaveBeenCalled();
  });
});
