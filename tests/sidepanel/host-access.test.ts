import { describe, expect, it, vi } from "vitest";
import {
  createHostAccessCoordinator,
  HOST_PERMISSION_ORIGINS,
} from "../../src/sidepanel/host-access";

function harness(granted = true, activeTabId = 21) {
  const request = vi.fn().mockResolvedValue(granted);
  const query = vi.fn().mockResolvedValue([{ id: activeTabId }]);
  const coordinator = createHostAccessCoordinator({ request }, { query });
  return { coordinator, request, query };
}

describe("host access coordinator", () => {
  it.each([
    ["boss", "https://*.zhipin.com/*"],
    ["liepin", "https://*.liepin.com/*"],
    ["zhaopin", "https://*.zhaopin.com/*"],
    ["51job", "https://*.51job.com/*"],
  ] as const)("requests only the selected %s platform", async (site, origin) => {
    const h = harness();

    await expect(h.coordinator.request(site, 21)).resolves.toBe("granted");

    expect(HOST_PERMISSION_ORIGINS[site]).toBe(origin);
    expect(h.request).toHaveBeenCalledWith({ origins: [origin] });
    expect(h.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it("returns denied without querying the active tab", async () => {
    const h = harness(false);

    await expect(h.coordinator.request("51job", 21)).resolves.toBe("denied");
    expect(h.query).not.toHaveBeenCalled();
  });

  it("marks a grant stale when the user changes tabs during authorization", async () => {
    const h = harness(true, 22);

    await expect(h.coordinator.request("liepin", 21)).resolves.toBe("stale");
  });

  it("falls back when permissions.request is unavailable or rejects", async () => {
    const missing = createHostAccessCoordinator({}, { query: vi.fn() });
    await expect(missing.request("zhaopin", 21)).resolves.toBe("unavailable");

    const rejected = harness();
    rejected.request.mockRejectedValueOnce(new Error("not eligible"));
    await expect(rejected.coordinator.request("zhaopin", 21)).resolves.toBe("unavailable");
  });

  it("does not finish an in-flight request after disposal", async () => {
    let finishRequest: ((granted: boolean) => void) | undefined;
    const request = vi.fn(() => new Promise<boolean>((resolve) => { finishRequest = resolve; }));
    const coordinator = createHostAccessCoordinator({ request }, { query: vi.fn() });

    const pending = coordinator.request("boss", 21);
    coordinator.dispose();
    finishRequest?.(true);

    await expect(pending).resolves.toBe("unavailable");
  });
});
