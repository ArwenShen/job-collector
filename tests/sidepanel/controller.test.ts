import { afterEach, describe, expect, it, vi } from "vitest";
import { createSidePanelController, type SidePanelRepository, type SidePanelState } from "../../src/sidepanel/controller";
import { extractActiveTab } from "../../src/sidepanel/extract-active-tab";
import type { PageResult } from "../../src/extractors";
import type { JobRecord } from "../../src/shared/job-record";

const sampleRecord: JobRecord = {
  schema_version: "1", source_site: "boss", source_job_id: "1",
  source_url: "https://www.zhipin.com/job_detail/1.html", job_title: "AI产品经理",
  company_name: "模思", salary: "40-70K·15薪", note: "", location: "上海",
  experience: "3-5年", education: "本科", job_description: "完整JD",
  company_description: "公司介绍", missing_fields: "",
  collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
};

function success(record: JobRecord | null, missingRequiredFields: Array<"job_title" | "job_description"> = []): PageResult {
  return { kind: "success", extraction: { record, missingRequiredFields, diagnostics: [] } };
}

function createHarness(options: {
  records?: JobRecord[];
  extract?: () => Promise<PageResult>;
  download?: (records: JobRecord[]) => void;
  render?: (state: SidePanelState) => void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
} = {}) {
  const records = (options.records ?? []).map((record) => ({ ...record }));
  const repository = {
    async save(value: JobRecord) {
      const index = records.findIndex((record) =>
        record.source_site === value.source_site && record.source_job_id === value.source_job_id,
      );
      if (index < 0) records.push({ ...value });
      else records[index] = { ...value, note: records[index]!.note };
    },
    async list() { return records.map((record) => ({ ...record })); },
    async has(value: Pick<JobRecord, "source_site" | "source_job_id">) {
      return records.some((record) =>
        record.source_site === value.source_site && record.source_job_id === value.source_job_id,
      );
    },
    async updateNote(value: Pick<JobRecord, "source_site" | "source_job_id">, note: string) {
      const record = records.find((item) =>
        item.source_site === value.source_site && item.source_job_id === value.source_job_id,
      );
      if (!record) throw new Error("Job record not found");
      record.note = note;
    },
    async remove(value: Pick<JobRecord, "source_site" | "source_job_id">) {
      const index = records.findIndex((item) =>
        item.source_site === value.source_site && item.source_job_id === value.source_job_id,
      );
      if (index < 0) return null;
      return { record: records.splice(index, 1)[0]!, index };
    },
    async restore(record: JobRecord, index: number) {
      const existingIndex = records.findIndex((item) =>
        item.source_site === record.source_site && item.source_job_id === record.source_job_id,
      );
      const value = existingIndex >= 0 ? records.splice(existingIndex, 1)[0]! : { ...record };
      const insertionIndex = Math.max(0, Math.min(index, records.length));
      records.splice(insertionIndex, 0, value);
    },
    async clear() { records.splice(0, records.length); },
  };
  const repositoryContract: SidePanelRepository = repository;
  return {
    records,
    repository: repositoryContract,
    extract: options.extract ?? vi.fn().mockResolvedValue({ kind: "unsupported-site" }),
    download: options.download ?? vi.fn(),
    render: options.render ?? vi.fn(),
    setTimeout: options.setTimeout,
    clearTimeout: options.clearTimeout,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("side panel controller", () => {
  it("loads stored rows without extracting on initialize", async () => {
    const extract = vi.fn();
    const harness = createHarness({ records: [sampleRecord], extract });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    expect(extract).not.toHaveBeenCalled();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({ records: [sampleRecord] }));
  });

  it("extracts and saves the active tab on every collect click", async () => {
    const second = { ...sampleRecord, source_job_id: "2", job_title: "第二个岗位" };
    const extract = vi.fn().mockResolvedValueOnce(success(sampleRecord)).mockResolvedValueOnce(success(second));
    const harness = createHarness({ extract });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.collect();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "success", text: "已收集当前职位" },
    }));
    await controller.collect();
    expect(extract).toHaveBeenCalledTimes(2);
    expect(harness.records.map((record) => record.source_job_id)).toEqual(["1", "2"]);
  });

  it("updates a duplicate in place and preserves its note", async () => {
    const old = { ...sampleRecord, note: "重点关注" };
    const updated = { ...sampleRecord, job_title: "更新后的岗位", note: "" };
    const harness = createHarness({ records: [old], extract: vi.fn().mockResolvedValue(success(updated)) });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.collect();
    expect(harness.records).toHaveLength(1);
    expect(harness.records[0]).toMatchObject({ job_title: "更新后的岗位", note: "重点关注" });
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "success", text: "已更新当前职位，没有新增重复记录" },
    }));
  });

  it.each<PageResult>([
    { kind: "unsupported-site" },
    { kind: "not-detail-page", site: "boss" },
  ])("keeps the list when collection is unavailable", async (page) => {
    const harness = createHarness({ records: [sampleRecord], extract: vi.fn().mockResolvedValue(page) });
    const save = vi.spyOn(harness.repository, "save");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.collect();
    expect(save).not.toHaveBeenCalled();
    expect(harness.records).toEqual([sampleRecord]);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: "请打开支持平台的职位详情页" }, busy: false,
    }));
  });

  it("reports missing required fields in extractor order without saving", async () => {
    const harness = createHarness({
      records: [sampleRecord],
      extract: vi.fn().mockResolvedValue(success(null, ["job_title", "job_description"])),
    });
    const save = vi.spyOn(harness.repository, "save");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.collect();
    expect(save).not.toHaveBeenCalled();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord],
      notice: { kind: "error", text: "无法完整识别该岗位：缺少 job_title、job_description" },
    }));
  });

  it.each([
    ["Cannot access contents of url", "请在当前职位页再次点击扩展图标后重试"],
    ["Missing host permission", "请在当前职位页再次点击扩展图标后重试"],
    ["Cannot inject into chrome://settings", "请在当前职位页再次点击扩展图标后重试"],
    ["tab disappeared", "无法读取当前页面，请打开职位详情后重试"],
  ])("maps extraction error %s without losing rows", async (message, expected) => {
    const harness = createHarness({ records: [sampleRecord], extract: vi.fn().mockRejectedValue(new Error(message)) });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.collect();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: expected }, busy: false,
    }));
  });

  it("keeps visible rows and reports save failures", async () => {
    const harness = createHarness({ records: [sampleRecord], extract: vi.fn().mockResolvedValue(success({ ...sampleRecord, source_job_id: "2" })) });
    harness.repository.save = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.collect();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: "保存失败，请重试" }, busy: false,
    }));
  });

  it("treats identity lookup failures as save failures without writing", async () => {
    const harness = createHarness({ extract: vi.fn().mockResolvedValue(success(sampleRecord)) });
    harness.repository.has = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const save = vi.spyOn(harness.repository, "save");
    const controller = createSidePanelController(harness);
    await controller.collect();
    expect(save).not.toHaveBeenCalled();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [], notice: { kind: "error", text: "保存失败，请重试" }, busy: false,
    }));
  });

  it("keeps the previous rows when reloading after save fails", async () => {
    const next = { ...sampleRecord, source_job_id: "2" };
    const harness = createHarness({ records: [sampleRecord], extract: vi.fn().mockResolvedValue(success(next)) });
    const originalList = harness.repository.list;
    const controller = createSidePanelController(harness);
    await controller.initialize();
    harness.repository.list = vi.fn()
      .mockImplementationOnce(async () => { throw new Error("storage unavailable"); })
      .mockImplementation(originalList);
    await controller.collect();
    expect(harness.records.map((record) => record.source_job_id)).toEqual(["1", "2"]);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: "列表读取失败，请重试" }, busy: false,
    }));
  });

  it("keeps the previous state and reports list failures", async () => {
    const harness = createHarness({ records: [sampleRecord] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    harness.repository.list = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    await controller.initialize();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: "列表读取失败，请重试" }, busy: false,
    }));
  });

  it("reads and downloads the latest stable order without clearing", async () => {
    const download = vi.fn();
    const harness = createHarness({ records: [sampleRecord], download });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    harness.records.push({ ...sampleRecord, source_job_id: "2" });
    await controller.exportCsv();
    expect(download).toHaveBeenCalledWith([sampleRecord, { ...sampleRecord, source_job_id: "2" }]);
    expect(harness.records).toHaveLength(2);
  });

  it("does not download an empty list and reports export failures", async () => {
    const harness = createHarness();
    const controller = createSidePanelController(harness);
    await controller.exportCsv();
    expect(harness.download).not.toHaveBeenCalled();
    harness.repository.list = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    await controller.exportCsv();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "error", text: "导出失败，请重试" },
    }));
  });

  it("does not let an older export snapshot overwrite records collected concurrently", async () => {
    let resolveExport!: (records: JobRecord[]) => void;
    const exportList = new Promise<JobRecord[]>((resolve) => { resolveExport = resolve; });
    const harness = createHarness({ records: [sampleRecord], extract: vi.fn().mockResolvedValue(success({
      ...sampleRecord, source_job_id: "2", job_title: "第二个岗位",
    })) });
    const originalList = harness.repository.list;
    const controller = createSidePanelController(harness);
    await controller.initialize();
    harness.repository.list = vi.fn()
      .mockImplementationOnce(() => exportList)
      .mockImplementation(originalList);

    const exporting = controller.exportCsv();
    await controller.collect();
    resolveExport([sampleRecord]);
    await exporting;

    harness.repository.list = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    await controller.initialize();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord, expect.objectContaining({ source_job_id: "2" })],
    }));
  });

  it("renders busy during collection and ignores a concurrent collect", async () => {
    let resolveExtract!: (page: PageResult) => void;
    const extract = vi.fn(() => new Promise<PageResult>((resolve) => { resolveExtract = resolve; }));
    const harness = createHarness({ extract });
    const controller = createSidePanelController(harness);
    const first = controller.collect();
    await Promise.resolve();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({ busy: true }));
    await controller.collect();
    expect(extract).toHaveBeenCalledTimes(1);
    resolveExtract(success(sampleRecord));
    await first;
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({ busy: false }));
  });

  it("does not let an overlapping initialize failure release the collect lock", async () => {
    let rejectInitialize!: (error: Error) => void;
    const initializeList = new Promise<JobRecord[]>((_resolve, reject) => { rejectInitialize = reject; });
    const extractResolvers: Array<(page: PageResult) => void> = [];
    const extract = vi.fn(() => new Promise<PageResult>((resolve) => { extractResolvers.push(resolve); }));
    const harness = createHarness({ extract });
    harness.repository.list = vi.fn().mockReturnValueOnce(initializeList).mockResolvedValue([]);
    const controller = createSidePanelController(harness);

    const initializing = controller.initialize();
    const firstCollect = controller.collect();
    await Promise.resolve();
    rejectInitialize(new Error("storage unavailable"));
    await initializing;
    const secondCollect = controller.collect();
    await Promise.resolve();
    extractResolvers.forEach((resolve) => resolve({ kind: "unsupported-site" }));
    await Promise.all([firstCollect, secondCollect]);

    expect(extract).toHaveBeenCalledTimes(1);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({ busy: false }));
  });

  it("ignores an older initialize list that resolves after collection", async () => {
    let resolveInitialize!: (records: JobRecord[]) => void;
    const initializeList = new Promise<JobRecord[]>((resolve) => { resolveInitialize = resolve; });
    const next = { ...sampleRecord, source_job_id: "2", job_title: "第二个岗位" };
    const harness = createHarness({ records: [sampleRecord], extract: vi.fn().mockResolvedValue(success(next)) });
    const originalList = harness.repository.list;
    harness.repository.list = vi.fn()
      .mockImplementationOnce(() => initializeList)
      .mockImplementation(originalList);
    const controller = createSidePanelController(harness);

    const initializing = controller.initialize();
    await controller.collect();
    const renderCountAfterCollect = vi.mocked(harness.render).mock.calls.length;
    resolveInitialize([sampleRecord]);
    await initializing;

    expect(harness.render).toHaveBeenCalledTimes(renderCountAfterCollect);
    harness.repository.list = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    await controller.initialize();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord, expect.objectContaining({ source_job_id: "2" })],
    }));
  });

  it("retains a pending initialization when collection fails before saving", async () => {
    let resolveInitialize!: (records: JobRecord[]) => void;
    const initializeList = new Promise<JobRecord[]>((resolve) => { resolveInitialize = resolve; });
    const harness = createHarness({ extract: vi.fn().mockResolvedValue({ kind: "unsupported-site" }) });
    harness.repository.list = vi.fn().mockReturnValue(initializeList);
    const controller = createSidePanelController(harness);

    const initializing = controller.initialize();
    await controller.collect();
    resolveInitialize([sampleRecord]);
    await initializing;

    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord],
      notice: { kind: "error", text: "请打开支持平台的职位详情页" },
      busy: false,
    }));
  });

  it("does not let an initialization read failure overwrite a newer collect error", async () => {
    let rejectInitialize!: (error: Error) => void;
    const initializeList = new Promise<JobRecord[]>((_resolve, reject) => { rejectInitialize = reject; });
    const harness = createHarness({ extract: vi.fn().mockResolvedValue({ kind: "unsupported-site" }) });
    harness.repository.list = vi.fn().mockReturnValue(initializeList);
    const controller = createSidePanelController(harness);

    const initializing = controller.initialize();
    await controller.collect();
    const renderCountAfterCollect = vi.mocked(harness.render).mock.calls.length;
    rejectInitialize(new Error("storage unavailable"));
    await initializing;

    expect(harness.render).toHaveBeenCalledTimes(renderCountAfterCollect);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "error", text: "请打开支持平台的职位详情页" },
      busy: false,
    }));
  });

  it("renders snapshots that cannot mutate controller records", async () => {
    const rendered: SidePanelState[] = [];
    const harness = createHarness({ records: [sampleRecord], render: (state) => rendered.push(state) });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    rendered.at(-1)!.records[0]!.job_title = "外部篡改";
    harness.repository.list = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    await controller.initialize();
    expect(rendered.at(-1)!.records[0]!.job_title).toBe("AI产品经理");
  });

  it("opens, cancels, trims, and saves notes while preserving internal newlines", async () => {
    const harness = createHarness({ records: [sampleRecord] });
    const updateNote = vi.spyOn(harness.repository, "updateNote");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    controller.requestClear();
    controller.openNote(sampleRecord);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      noteEditor: { key: "boss:1", value: "" }, clearConfirmOpen: false,
    }));
    controller.cancelNote();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({ noteEditor: undefined }));
    controller.openNote(sampleRecord);
    await controller.saveNote("  第一行\n  第二行  ");
    expect(updateNote).toHaveBeenCalledWith(
      { source_site: "boss", source_job_id: "1" },
      "第一行\n  第二行",
    );
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [expect.objectContaining({ note: "第一行\n  第二行" })],
      noteEditor: undefined,
      notice: { kind: "success", text: "备注已保存" },
    }));
  });

  it("allows an empty note and ignores save when no editor is open", async () => {
    const harness = createHarness({ records: [{ ...sampleRecord, note: "old" }] });
    const updateNote = vi.spyOn(harness.repository, "updateNote");
    const controller = createSidePanelController(harness);
    await controller.saveNote("ignored");
    expect(updateNote).not.toHaveBeenCalled();
    controller.openNote({ ...sampleRecord, note: "old" });
    await controller.saveNote("   ");
    expect(updateNote).toHaveBeenCalledWith(expect.anything(), "");
  });

  it("accepts a note at the 200-character boundary", async () => {
    const harness = createHarness({ records: [sampleRecord] });
    const updateNote = vi.spyOn(harness.repository, "updateNote");
    const controller = createSidePanelController(harness);
    controller.openNote(sampleRecord);
    await controller.saveNote("x".repeat(200));
    expect(updateNote).toHaveBeenCalledWith(expect.anything(), "x".repeat(200));
  });

  it("keeps the attempted note open on validation and repository failures and supports retry", async () => {
    const harness = createHarness({ records: [sampleRecord] });
    const updateNote = vi.spyOn(harness.repository, "updateNote");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    controller.openNote(sampleRecord);
    await controller.saveNote("x".repeat(201));
    expect(updateNote).not.toHaveBeenCalled();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      noteEditor: { key: "boss:1", value: "x".repeat(201) },
      notice: { kind: "error", text: "备注不能超过 200 个字符" },
    }));

    harness.repository.updateNote = vi.fn()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValue(undefined);
    await controller.saveNote(" retry me ");
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], noteEditor: { key: "boss:1", value: " retry me " },
      notice: { kind: "error", text: "备注保存失败，请重试" }, busy: false,
    }));
    await controller.saveNote(" retry me ");
    expect(harness.repository.updateNote).toHaveBeenCalledTimes(2);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      noteEditor: undefined, notice: { kind: "success", text: "备注已保存" }, busy: false,
    }));
  });

  it("deletes immediately, expires only its undo notice, and disposes timers", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ records: [sampleRecord] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(sampleRecord);
    expect(harness.records).toEqual([]);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [], notice: { kind: "undo", text: "已删除 1 个职位" },
    }));
    controller.openNote(sampleRecord);
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      noteEditor: { key: "boss:1", value: "" }, notice: undefined,
    }));

    harness.records.push(sampleRecord);
    await controller.deleteRecord(sampleRecord);
    controller.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "undo", text: "已删除 1 个职位" },
    }));
  });

  it("does not let an undo timer clear a newer notice", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ records: [sampleRecord] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(sampleRecord);
    harness.repository.list = vi.fn().mockRejectedValue(new Error("unavailable"));
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "error", text: "列表读取失败，请重试" },
    }));
  });

  it("uses injected timer dependencies for the undo window", async () => {
    let expire!: () => void;
    const setTimeout = vi.fn((callback: () => void) => {
      expire = callback;
      return 17 as unknown as ReturnType<typeof globalThis.setTimeout>;
    }) as unknown as typeof globalThis.setTimeout;
    const clearTimeout = vi.fn() as unknown as typeof globalThis.clearTimeout;
    const harness = createHarness({ records: [sampleRecord], setTimeout, clearTimeout });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(sampleRecord);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    expire();
    await controller.undoDelete();
    expect(harness.records).toEqual([]);
  });

  it("undoes deletion at the original position with the complete record", async () => {
    vi.useFakeTimers();
    const first = { ...sampleRecord, source_job_id: "0", job_title: "first" };
    const last = { ...sampleRecord, source_job_id: "2", job_title: "last" };
    const removed = { ...sampleRecord, note: "完整备注" };
    const harness = createHarness({ records: [first, removed, last] });
    const restore = vi.spyOn(harness.repository, "restore");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(removed);
    await controller.undoDelete();
    expect(restore).toHaveBeenCalledWith(removed, 1);
    expect(harness.records).toEqual([first, removed, last]);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "success", text: "已撤销删除" },
    }));
  });

  it("keeps undo retryable after restore failure until expiry", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ records: [sampleRecord] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(sampleRecord);
    const originalRestore = harness.repository.restore;
    harness.repository.restore = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockImplementation(originalRestore);
    await controller.undoDelete();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      notice: { kind: "error", text: "撤销失败，请重试" },
    }));
    await controller.undoDelete();
    expect(harness.records).toEqual([sampleRecord]);

    await controller.deleteRecord(sampleRecord);
    await vi.advanceTimersByTimeAsync(5000);
    await controller.undoDelete();
    expect(harness.records).toEqual([]);
  });

  it("invalidates the first undo when a second record is deleted", async () => {
    vi.useFakeTimers();
    const second = { ...sampleRecord, source_job_id: "2" };
    const harness = createHarness({ records: [sampleRecord, second] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(sampleRecord);
    await controller.deleteRecord(second);
    await controller.undoDelete();
    expect(harness.records).toEqual([second]);
  });

  it("preserves newly saved identity data when undo only restores its position", async () => {
    vi.useFakeTimers();
    const second = { ...sampleRecord, source_job_id: "2" };
    const harness = createHarness({ records: [sampleRecord, second] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.deleteRecord(sampleRecord);
    await harness.repository.save({ ...sampleRecord, job_title: "new title", note: "new note" });
    await controller.undoDelete();
    expect(harness.records[0]).toMatchObject({ job_title: "new title", note: "new note" });
  });

  it("handles missing and failed deletes without losing visible rows", async () => {
    const harness = createHarness({ records: [sampleRecord] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    harness.repository.remove = vi.fn().mockResolvedValue(null);
    await controller.deleteRecord(sampleRecord);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: "职位不存在或已被删除" },
    }));
    harness.repository.remove = vi.fn().mockRejectedValue(new Error("unavailable"));
    await controller.deleteRecord(sampleRecord);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], notice: { kind: "error", text: "删除失败，请重试" }, busy: false,
    }));
  });

  it("does not let an older initialize snapshot overwrite a completed deletion", async () => {
    vi.useFakeTimers();
    let resolveInitialize!: (records: JobRecord[]) => void;
    const staleList = new Promise<JobRecord[]>((resolve) => { resolveInitialize = resolve; });
    const harness = createHarness({ records: [sampleRecord] });
    const originalList = harness.repository.list;
    harness.repository.list = vi.fn().mockReturnValueOnce(staleList).mockImplementation(originalList);
    const controller = createSidePanelController(harness);
    const initializing = controller.initialize();
    await controller.deleteRecord(sampleRecord);
    resolveInitialize([sampleRecord]);
    await initializing;
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({ records: [] }));
  });

  it("opens and cancels clear confirmation without changing records", async () => {
    const emptyHarness = createHarness();
    const emptyController = createSidePanelController(emptyHarness);
    emptyController.requestClear();
    expect(emptyHarness.render).not.toHaveBeenCalled();

    const harness = createHarness({ records: [sampleRecord] });
    const controller = createSidePanelController(harness);
    await controller.initialize();
    controller.openNote(sampleRecord);
    controller.requestClear();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      clearConfirmOpen: true, noteEditor: undefined, records: [sampleRecord],
    }));
    controller.cancelClear();
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      clearConfirmOpen: false, records: [sampleRecord],
    }));
  });

  it("clears only after confirmation and permanently invalidates pending undo", async () => {
    vi.useFakeTimers();
    const second = { ...sampleRecord, source_job_id: "2" };
    const harness = createHarness({ records: [sampleRecord, second] });
    const clear = vi.spyOn(harness.repository, "clear");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    await controller.confirmClear();
    expect(clear).not.toHaveBeenCalled();
    await controller.deleteRecord(sampleRecord);
    controller.requestClear();
    await controller.confirmClear();
    await controller.undoDelete();
    expect(harness.records).toEqual([]);
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      clearConfirmOpen: false, notice: { kind: "success", text: "已清空全部职位" },
    }));
  });

  it("keeps the clear dialog and rows on failure and ignores concurrent mutations", async () => {
    let rejectClear!: (error: Error) => void;
    const clearing = new Promise<void>((_resolve, reject) => { rejectClear = reject; });
    const harness = createHarness({ records: [sampleRecord] });
    harness.repository.clear = vi.fn().mockReturnValue(clearing);
    const remove = vi.spyOn(harness.repository, "remove");
    const controller = createSidePanelController(harness);
    await controller.initialize();
    controller.requestClear();
    const first = controller.confirmClear();
    await controller.confirmClear();
    await controller.deleteRecord(sampleRecord);
    expect(harness.repository.clear).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    rejectClear(new Error("unavailable"));
    await first;
    expect(harness.render).toHaveBeenLastCalledWith(expect.objectContaining({
      records: [sampleRecord], clearConfirmOpen: true,
      notice: { kind: "error", text: "清空失败，请重试" }, busy: false,
    }));
  });
});

describe("extractActiveTab", () => {
  it("queries and extracts afresh on every call, then consumes the page result", async () => {
    const query = vi.fn().mockResolvedValue([{ id: 7 }]);
    let pageResult: PageResult | undefined = success(sampleRecord);
    const executeScript = vi.fn(async (details: { files?: string[]; func?: () => unknown }) => {
      if (details.files) return [];
      const scope = globalThis as unknown as Record<string, unknown>;
      scope.__JOB_COLLECTOR_RESULT__ = pageResult;
      pageResult = undefined;
      const result = details.func?.();
      expect(scope).not.toHaveProperty("__JOB_COLLECTOR_RESULT__");
      return [{ result }];
    });
    vi.stubGlobal("chrome", { tabs: { query }, scripting: { executeScript } });
    expect(await extractActiveTab()).toEqual(success(sampleRecord));
    pageResult = { kind: "not-detail-page", site: "boss" };
    expect(await extractActiveTab()).toEqual({ kind: "not-detail-page", site: "boss" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(1, { active: true, currentWindow: true });
    expect(executeScript).toHaveBeenCalledTimes(4);
  });

  it("returns unsupported when the active tab has no id or content has no result", async () => {
    const query = vi.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ id: 9 }]);
    const executeScript = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    vi.stubGlobal("chrome", { tabs: { query }, scripting: { executeScript } });
    expect(await extractActiveTab()).toEqual({ kind: "unsupported-site" });
    expect(executeScript).not.toHaveBeenCalled();
    expect(await extractActiveTab()).toEqual({ kind: "unsupported-site" });
  });
});
