import type { PageResult } from "../extractors";
import type { JobRecord } from "../shared/job-record";
import type { PopupState } from "./view";

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

export interface PopupRepository {
  save(record: JobRecord): Promise<void>;
  list(): Promise<JobRecord[]>;
  count(): Promise<number>;
  has(record: Pick<JobRecord, "source_site" | "source_job_id">): Promise<boolean>;
  clear(): Promise<void>;
}

export function createPopupController(deps: {
  extract: () => Promise<PageResult>;
  repository: PopupRepository;
  download: (records: JobRecord[]) => void;
  confirmClear: () => boolean;
  render: (state: PopupState) => void;
}) {
  let currentRecord: JobRecord | null = null;

  async function safeCount(): Promise<number> {
    try {
      return await deps.repository.count();
    } catch {
      return 0;
    }
  }

  async function renderFailure(message: string): Promise<void> {
    deps.render({ kind: "failed", count: await safeCount(), missing: [], message });
  }

  async function renderCurrent(message?: string): Promise<void> {
    if (!currentRecord) {
      await refresh();
      return;
    }
    deps.render({
      kind: "collectable",
      count: await deps.repository.count(),
      record: currentRecord,
      alreadyStored: await deps.repository.has(currentRecord),
      message,
    });
  }

  async function refresh(message?: string): Promise<void> {
    const count = await deps.repository.count();
    const page = await deps.extract();
    if (page.kind === "unsupported-site" || page.kind === "not-detail-page") {
      deps.render({ kind: "not-detail", count });
      return;
    }
    if (!page.extraction.record) {
      deps.render({ kind: "failed", count, missing: page.extraction.missingRequiredFields });
      return;
    }
    currentRecord = page.extraction.record;
    deps.render({
      kind: "collectable", count, record: currentRecord,
      alreadyStored: await deps.repository.has(currentRecord), message,
    });
  }

  return {
    async initialize() {
      try {
        await refresh();
      } catch {
        await renderFailure("无法读取当前页面，请刷新后重试");
      }
    },
    async collect() {
      if (!currentRecord) return;
      try {
        const existed = await deps.repository.has(currentRecord);
        await deps.repository.save(currentRecord);
        await renderCurrent(existed ? "已更新" : "已收集");
      } catch {
        await renderFailure("保存失败，请重试");
      }
    },
    async exportCsv() {
      try {
        const records = await deps.repository.list();
        if (records.length) deps.download(records);
      } catch {
        await renderFailure("导出失败，请重试");
      }
    },
    async clear() {
      if (!deps.confirmClear()) return;
      try {
        await deps.repository.clear();
        await renderCurrent();
      } catch {
        await renderFailure("清空失败，请重试");
      }
    },
  };
}
