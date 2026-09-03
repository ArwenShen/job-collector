import type { PageResult } from "../extractors";
import type { JobRecord } from "../shared/job-record";

export type Notice =
  | { kind: "success" | "error"; text: string }
  | { kind: "undo"; text: string };

export interface NoteEditorState {
  key: string;
  value: string;
}

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
}

export function createSidePanelController(deps: {
  extract: () => Promise<PageResult>;
  repository: SidePanelRepository;
  download: (records: JobRecord[]) => void;
  render: (state: SidePanelState) => void;
}) {
  const state: SidePanelState = {
    records: [],
    clearConfirmOpen: false,
    busy: false,
  };

  function cloneRecords(records: JobRecord[]): JobRecord[] {
    return records.map((record) => ({ ...record }));
  }

  function render(): void {
    deps.render({
      ...state,
      records: cloneRecords(state.records),
      notice: state.notice ? { ...state.notice } : undefined,
      noteEditor: state.noteEditor ? { ...state.noteEditor } : undefined,
    });
  }

  async function readList(): Promise<void> {
    state.records = cloneRecords(await deps.repository.list());
  }

  function fail(text: string): void {
    state.notice = { kind: "error", text };
    state.busy = false;
    render();
  }

  function extractionErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return ["Cannot access", "Missing host permission", "chrome://"].some((part) => message.includes(part))
      ? "请在当前职位页再次点击扩展图标后重试"
      : "无法读取当前页面，请打开职位详情后重试";
  }

  return {
    async initialize(): Promise<void> {
      try {
        await readList();
        render();
      } catch {
        fail("列表读取失败，请重试");
      }
    },

    async collect(): Promise<void> {
      if (state.busy) return;
      state.busy = true;
      render();

      let page: PageResult;
      try {
        page = await deps.extract();
      } catch (error) {
        fail(extractionErrorMessage(error));
        return;
      }

      if (page.kind !== "success") {
        fail("请打开支持平台的职位详情页");
        return;
      }
      if (!page.extraction.record) {
        fail(`无法完整识别该岗位：缺少 ${page.extraction.missingRequiredFields.join("、")}`);
        return;
      }

      let existed: boolean;
      try {
        existed = await deps.repository.has(page.extraction.record);
        await deps.repository.save(page.extraction.record);
      } catch {
        fail("保存失败，请重试");
        return;
      }

      try {
        await readList();
      } catch {
        fail("列表读取失败，请重试");
        return;
      }

      state.notice = {
        kind: "success",
        text: existed ? "已更新当前职位，没有新增重复记录" : "已收集当前职位",
      };
      state.busy = false;
      render();
    },

    async exportCsv(): Promise<void> {
      try {
        const records = cloneRecords(await deps.repository.list());
        state.records = cloneRecords(records);
        if (records.length > 0) deps.download(records);
      } catch {
        state.notice = { kind: "error", text: "导出失败，请重试" };
        render();
      }
    },
  };
}
