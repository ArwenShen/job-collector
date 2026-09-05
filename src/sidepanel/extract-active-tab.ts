import type { PageResult } from "../extractors";

const SUPPORTED_HOSTS = ["zhipin.com", "liepin.com", "zhaopin.com", "51job.com"] as const;

export class HostAccessRequiredError extends Error {
  readonly tabId: number;

  constructor(tabId: number, cause: unknown) {
    super(`Host access is required for tab ${tabId}`, { cause });
    this.name = "HostAccessRequiredError";
    this.tabId = tabId;
  }
}

function isSupportedPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (!error.message.includes("Cannot access contents of url")
    && !error.message.includes("Missing host permission")) return false;

  const match = error.message.match(/["'](https:\/\/[^"']+)["']/i);
  if (!match?.[1]) return false;
  try {
    const hostname = new URL(match[1]).hostname.toLowerCase();
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
  } catch (error) {
    if (isSupportedPermissionError(error)) throw new HostAccessRequiredError(tab.id, error);
    throw error;
  }
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
