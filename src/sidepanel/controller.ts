import type { PageResult } from "../extractors";
import type { JobRecord } from "../shared/job-record";
import type { RemovedJob } from "../storage/job-repository";

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
  undoAvailable: boolean;
}

export interface SidePanelRepository {
  save(record: JobRecord): Promise<void>;
  list(): Promise<JobRecord[]>;
  has(record: Pick<JobRecord, "source_site" | "source_job_id">): Promise<boolean>;
  updateNote(
    record: Pick<JobRecord, "source_site" | "source_job_id">,
    note: string,
  ): Promise<void>;
  remove(
    record: Pick<JobRecord, "source_site" | "source_job_id">,
  ): Promise<RemovedJob | null>;
  restore(record: JobRecord, index: number): Promise<void>;
  clear(): Promise<void>;
}

export function createSidePanelController(deps: {
  extract: () => Promise<PageResult>;
  repository: SidePanelRepository;
  download: (records: JobRecord[]) => void;
  render: (state: SidePanelState) => void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}) {
  const state: SidePanelState = {
    records: [],
    clearConfirmOpen: false,
    busy: false,
    undoAvailable: false,
  };
  let listGeneration = 0;
  let mutationBusy = false;
  let noteIdentity: Pick<JobRecord, "source_site" | "source_job_id"> | undefined;
  let pendingDelete: RemovedJob | undefined;
  let undoTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const schedule = deps.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancelSchedule = deps.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);

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

  async function readList(): Promise<boolean> {
    const generation = ++listGeneration;
    try {
      const records = await deps.repository.list();
      if (generation !== listGeneration) return false;
      state.records = cloneRecords(records);
      return true;
    } catch (error) {
      if (generation !== listGeneration) return false;
      throw error;
    }
  }

  function fail(text: string): void {
    state.notice = { kind: "error", text };
    render();
  }

  function identity(record: Pick<JobRecord, "source_site" | "source_job_id">) {
    return { source_site: record.source_site, source_job_id: record.source_job_id };
  }

  function recordKey(record: Pick<JobRecord, "source_site" | "source_job_id">): string {
    return `${record.source_site}:${record.source_job_id}`;
  }

  function invalidatePendingDelete(): void {
    if (undoTimer !== undefined) cancelSchedule(undoTimer);
    undoTimer = undefined;
    pendingDelete = undefined;
    state.undoAvailable = false;
  }

  function startUndoWindow(removed: RemovedJob): void {
    const snapshot = { record: { ...removed.record }, index: removed.index };
    pendingDelete = snapshot;
    state.undoAvailable = true;
    const undoNotice: Notice = { kind: "undo", text: "已删除 1 个职位" };
    state.notice = undoNotice;
    undoTimer = schedule(() => {
      if (pendingDelete !== snapshot) return;
      undoTimer = undefined;
      pendingDelete = undefined;
      state.undoAvailable = false;
      if (state.notice?.kind === "undo") state.notice = undefined;
      render();
    }, 5000);
  }

  function beginMutation(): boolean {
    if (state.busy || mutationBusy) return false;
    mutationBusy = true;
    state.busy = true;
    ++listGeneration;
    render();
    return true;
  }

  function endMutation(): void {
    mutationBusy = false;
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
      const noticeAtStart = state.notice;
      try {
        if (await readList()) render();
      } catch {
        if (state.notice === noticeAtStart) fail("列表读取失败，请重试");
      }
    },

    async collect(): Promise<void> {
      if (state.busy) return;
      state.busy = true;
      render();

      try {
        let page: PageResult;
        try {
          page = await deps.extract();
        } catch (error) {
          state.notice = { kind: "error", text: extractionErrorMessage(error) };
          return;
        }

        if (page.kind !== "success") {
          state.notice = { kind: "error", text: "请打开支持平台的职位详情页" };
          return;
        }
        if (!page.extraction.record) {
          state.notice = {
            kind: "error",
            text: `无法完整识别该岗位：缺少 ${page.extraction.missingRequiredFields.join("、")}`,
          };
          return;
        }

        let existed: boolean;
        try {
          existed = await deps.repository.has(page.extraction.record);
          await deps.repository.save(page.extraction.record);
        } catch {
          state.notice = { kind: "error", text: "保存失败，请重试" };
          return;
        }

        try {
          if (!await readList()) return;
        } catch {
          state.notice = { kind: "error", text: "列表读取失败，请重试" };
          return;
        }

        state.notice = {
          kind: "success",
          text: existed ? "已更新当前职位，没有新增重复记录" : "已收集当前职位",
        };
      } finally {
        state.busy = false;
        render();
      }
    },

    async exportCsv(): Promise<void> {
      try {
        const records = cloneRecords(await deps.repository.list());
        if (records.length > 0) deps.download(records);
      } catch {
        state.notice = { kind: "error", text: "导出失败，请重试" };
        render();
      }
    },

    openNote(record: JobRecord): void {
      state.clearConfirmOpen = false;
      noteIdentity = identity(record);
      state.noteEditor = { key: recordKey(record), value: record.note };
      render();
    },

    cancelNote(): void {
      if (!state.noteEditor) return;
      noteIdentity = undefined;
      state.noteEditor = undefined;
      render();
    },

    async saveNote(value: string): Promise<void> {
      const editor = state.noteEditor;
      const target = noteIdentity;
      if (!editor || !target || !beginMutation()) return;
      editor.value = value;
      const note = value.trim();

      try {
        if (note.length > 200) {
          state.notice = { kind: "error", text: "备注不能超过 200 个字符" };
          return;
        }
        await deps.repository.updateNote(target, note);
        await readList();
        noteIdentity = undefined;
        state.noteEditor = undefined;
        state.notice = { kind: "success", text: "备注已保存" };
      } catch {
        state.notice = { kind: "error", text: "备注保存失败，请重试" };
      } finally {
        endMutation();
      }
    },

    async deleteRecord(record: JobRecord): Promise<void> {
      if (!beginMutation()) return;
      try {
        const removed = await deps.repository.remove(identity(record));
        if (!removed) {
          await readList();
          state.notice = { kind: "error", text: "职位不存在或已被删除" };
          return;
        }
        invalidatePendingDelete();
        await readList();
        startUndoWindow(removed);
      } catch {
        state.notice = { kind: "error", text: "删除失败，请重试" };
      } finally {
        endMutation();
      }
    },

    async undoDelete(): Promise<void> {
      const removed = pendingDelete;
      if (!removed || !beginMutation()) return;
      try {
        await deps.repository.restore(removed.record, removed.index);
        invalidatePendingDelete();
        await readList();
        state.notice = { kind: "success", text: "已撤销删除" };
      } catch {
        state.notice = pendingDelete === removed
          ? { kind: "undo", text: "撤销失败，请重试" }
          : { kind: "error", text: "撤销失败，请重试" };
      } finally {
        endMutation();
      }
    },

    requestClear(): void {
      if (state.records.length === 0) return;
      noteIdentity = undefined;
      state.noteEditor = undefined;
      state.clearConfirmOpen = true;
      render();
    },

    cancelClear(): void {
      if (!state.clearConfirmOpen) return;
      state.clearConfirmOpen = false;
      render();
    },

    async confirmClear(): Promise<void> {
      if (!state.clearConfirmOpen || !beginMutation()) return;
      invalidatePendingDelete();
      try {
        await deps.repository.clear();
        await readList();
        state.clearConfirmOpen = false;
        state.notice = { kind: "success", text: "已清空全部职位" };
      } catch {
        state.notice = { kind: "error", text: "清空失败，请重试" };
      } finally {
        endMutation();
      }
    },

    dispose(): void {
      invalidatePendingDelete();
    },
  };
}
