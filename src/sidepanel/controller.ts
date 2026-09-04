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
  let disposed = false;
  let noteIdentity: Pick<JobRecord, "source_site" | "source_job_id"> | undefined;
  let pendingDelete: RemovedJob | undefined;
  let undoTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const schedule = deps.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancelSchedule = deps.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);

  function cloneRecords(records: JobRecord[]): JobRecord[] {
    return records.map((record) => ({ ...record }));
  }

  function render(): void {
    if (disposed) return;
    deps.render({
      ...state,
      records: cloneRecords(state.records),
      notice: state.notice ? { ...state.notice } : undefined,
      noteEditor: state.noteEditor ? { ...state.noteEditor } : undefined,
    });
  }

  async function readList(): Promise<boolean> {
    if (disposed) return false;
    const generation = ++listGeneration;
    try {
      const records = await deps.repository.list();
      if (disposed || generation !== listGeneration) return false;
      state.records = cloneRecords(records);
      return true;
    } catch (error) {
      if (disposed || generation !== listGeneration) return false;
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
    if (disposed) return;
    const snapshot = { record: { ...removed.record }, index: removed.index };
    pendingDelete = snapshot;
    state.undoAvailable = true;
    const undoNotice: Notice = { kind: "undo", text: "已删除 1 个职位" };
    state.notice = undoNotice;
    undoTimer = schedule(() => {
      if (disposed || pendingDelete !== snapshot) return;
      undoTimer = undefined;
      pendingDelete = undefined;
      state.undoAvailable = false;
      if (state.notice?.kind === "undo") state.notice = undefined;
      render();
    }, 5000);
  }

  function beginMutation(): boolean {
    if (disposed || state.busy || mutationBusy) return false;
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

  function updateNoteLocally(
    target: Pick<JobRecord, "source_site" | "source_job_id">,
    note: string,
  ): void {
    const key = recordKey(target);
    state.records = state.records.map((record) =>
      recordKey(record) === key ? { ...record, note } : record,
    );
  }

  function restoreLocally(removed: RemovedJob): void {
    const key = recordKey(removed.record);
    const records = state.records.filter((record) => recordKey(record) !== key);
    const index = Math.max(0, Math.min(removed.index, records.length));
    records.splice(index, 0, { ...removed.record });
    state.records = records;
  }

  function removeLocally(record: Pick<JobRecord, "source_site" | "source_job_id">): void {
    const key = recordKey(record);
    state.records = state.records.filter((item) => recordKey(item) !== key);
  }

  return {
    async initialize(): Promise<void> {
      if (disposed) return;
      const noticeAtStart = state.notice;
      try {
        const refreshed = await readList();
        if (disposed) return;
        if (refreshed) render();
      } catch {
        if (!disposed && state.notice === noticeAtStart) fail("列表读取失败，请重试");
      }
    },

    async collect(): Promise<void> {
      if (disposed || state.busy) return;
      state.busy = true;
      render();

      try {
        let page: PageResult;
        try {
          page = await deps.extract();
        } catch (error) {
          if (disposed) return;
          state.notice = { kind: "error", text: extractionErrorMessage(error) };
          return;
        }
        if (disposed) return;

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
          if (disposed) return;
          await deps.repository.save(page.extraction.record);
        } catch {
          if (disposed) return;
          state.notice = { kind: "error", text: "保存失败，请重试" };
          return;
        }
        if (disposed) return;

        try {
          const refreshed = await readList();
          if (disposed || !refreshed) return;
        } catch {
          if (disposed) return;
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
      if (disposed) return;
      try {
        const records = cloneRecords(await deps.repository.list());
        if (disposed) return;
        if (records.length > 0) deps.download(records);
      } catch {
        if (disposed) return;
        state.notice = { kind: "error", text: "导出失败，请重试" };
        render();
      }
    },

    openNote(record: JobRecord): void {
      if (disposed) return;
      state.clearConfirmOpen = false;
      noteIdentity = identity(record);
      state.noteEditor = { key: recordKey(record), value: record.note };
      render();
    },

    cancelNote(): void {
      if (disposed || !state.noteEditor) return;
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
        try {
          await deps.repository.updateNote(target, note);
        } catch {
          if (!disposed) state.notice = { kind: "error", text: "备注保存失败，请重试" };
          return;
        }
        if (disposed) return;
        updateNoteLocally(target, note);
        noteIdentity = undefined;
        state.noteEditor = undefined;
        state.notice = { kind: "success", text: "备注已保存" };
        render();
        try {
          await readList();
          if (disposed) return;
        } catch {
          if (!disposed) state.notice = { kind: "error", text: "列表读取失败，请重试" };
        }
      } finally {
        endMutation();
      }
    },

    async deleteRecord(record: JobRecord): Promise<void> {
      if (!beginMutation()) return;
      let removed: RemovedJob | null;
      try {
        try {
          removed = await deps.repository.remove(identity(record));
        } catch {
          if (disposed) return;
          state.notice = { kind: "error", text: "删除失败，请重试" };
          return;
        }
        if (disposed) return;
        if (removed) {
          invalidatePendingDelete();
          removeLocally(removed.record);
          startUndoWindow(removed);
          render();
        }
        try {
          const refreshed = await readList();
          if (disposed || !refreshed) return;
        } catch {
          if (disposed) return;
          state.notice = { kind: "error", text: "列表读取失败，请重试" };
          return;
        }
        if (!removed) state.notice = { kind: "error", text: "职位不存在或已被删除" };
      } finally {
        endMutation();
      }
    },

    async undoDelete(): Promise<void> {
      const removed = pendingDelete;
      if (!removed || !beginMutation()) return;
      try {
        try {
          await deps.repository.restore(removed.record, removed.index);
        } catch {
          if (!disposed) {
            state.notice = pendingDelete === removed
              ? { kind: "undo", text: "撤销失败，请重试" }
              : { kind: "error", text: "撤销失败，请重试" };
          }
          return;
        }
        if (disposed) return;
        invalidatePendingDelete();
        restoreLocally(removed);
        state.notice = { kind: "success", text: "已撤销删除" };
        render();
        try {
          await readList();
          if (disposed) return;
        } catch {
          if (!disposed) state.notice = { kind: "error", text: "列表读取失败，请重试" };
        }
      } finally {
        endMutation();
      }
    },

    requestClear(): void {
      if (disposed || state.records.length === 0) return;
      noteIdentity = undefined;
      state.noteEditor = undefined;
      state.clearConfirmOpen = true;
      render();
    },

    cancelClear(): void {
      if (disposed || !state.clearConfirmOpen) return;
      state.clearConfirmOpen = false;
      render();
    },

    async confirmClear(): Promise<void> {
      if (!state.clearConfirmOpen || !beginMutation()) return;
      try {
        try {
          await deps.repository.clear();
        } catch {
          if (!disposed) state.notice = { kind: "error", text: "清空失败，请重试" };
          return;
        }
        if (disposed) return;
        state.records = [];
        state.clearConfirmOpen = false;
        invalidatePendingDelete();
        state.notice = { kind: "success", text: "已清空全部职位" };
        render();
        try {
          await readList();
          if (disposed) return;
        } catch {
          if (!disposed) state.notice = { kind: "error", text: "列表读取失败，请重试" };
        }
      } finally {
        endMutation();
      }
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++listGeneration;
      invalidatePendingDelete();
    },
  };
}
