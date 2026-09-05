import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractActiveTab,
  HostAccessRequiredError,
} from "../../src/sidepanel/extract-active-tab";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubChrome(tab: { id?: number; url?: string }, injectionError?: unknown) {
  const query = vi.fn().mockResolvedValue([tab]);
  const executeScript = vi.fn().mockRejectedValue(injectionError);
  vi.stubGlobal("chrome", { tabs: { query }, scripting: { executeScript } });
  return { query, executeScript };
}

describe("extractActiveTab host access failures", () => {
  it.each([
    "https://www.zhipin.com/job_detail/1.html",
    "https://jobs.liepin.com/job/1",
    "https://www.zhaopin.com/jobdetail/1",
    "https://jobs.51job.com/shanghai/1.html",
  ])("classifies permission denial on %s", async (url) => {
    const cause = new Error(`Cannot access contents of url \"${url}\"`);
    stubChrome({ id: 7, url }, cause);

    const promise = extractActiveTab();
    await expect(promise).rejects.toBeInstanceOf(HostAccessRequiredError);
    await expect(promise).rejects.toMatchObject({ name: "HostAccessRequiredError", tabId: 7, cause });
  });

  it.each([
    `Cannot access contents of url "https://example.com/jobs/1"`,
    `Missing host permission for the tab "https://example.com/jobs/1"`,
    `Cannot inject into chrome://settings`,
    "Cannot access contents of url https://www.zhipin.com/jobs/1",
    `Cannot access contents of url "https://[invalid"`,
    "tab disappeared",
  ])("rethrows unsupported or unrelated injection error: %s", async (message) => {
    const cause = new Error(message);
    stubChrome({ id: 7, url: "https://www.zhipin.com/jobs/1" }, cause);

    await expect(extractActiveTab()).rejects.toBe(cause);
  });

  it("classifies a missing-host-permission error with a supported quoted URL", async () => {
    const cause = new Error('Missing host permission for the tab "https://www.zhipin.com/jobs/1"');
    stubChrome({ id: 7, url: "https://www.zhipin.com/jobs/1" }, cause);

    await expect(extractActiveTab()).rejects.toMatchObject({
      name: "HostAccessRequiredError", tabId: 7, cause,
    });
  });

  it("classifies Chromium's URL-free page permission denial", async () => {
    const cause = new Error(
      "Cannot access contents of the page. Extension manifest must request permission to access the respective host.",
    );
    stubChrome({ id: 7 }, cause);

    await expect(extractActiveTab()).rejects.toMatchObject({
      name: "HostAccessRequiredError", tabId: 7, cause,
    });
  });

  it("returns unsupported without injecting when the tab has no id", async () => {
    const { executeScript } = stubChrome({ url: "https://www.zhipin.com/jobs/1" });

    await expect(extractActiveTab()).resolves.toEqual({ kind: "unsupported-site" });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("classifies permission denial while consuming the page result", async () => {
    const cause = new Error('Cannot access contents of url "https://www.zhipin.com/jobs/1"');
    const query = vi.fn().mockResolvedValue([{ id: 7, url: "https://www.zhipin.com/jobs/1" }]);
    const executeScript = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(cause);
    vi.stubGlobal("chrome", { tabs: { query }, scripting: { executeScript } });

    await expect(extractActiveTab()).rejects.toMatchObject({
      name: "HostAccessRequiredError", tabId: 7, cause,
    });
    expect(executeScript).toHaveBeenCalledTimes(2);
  });
});
