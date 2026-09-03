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
