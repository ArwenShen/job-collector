import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupController, type PopupRepository } from "../../src/popup/controller";
import type { JobRecord } from "../../src/shared/job-record";
import { renderPopup, type PopupState } from "../../src/popup/view";

const sampleRecord: JobRecord = {
  schema_version: "1", source_site: "boss", source_job_id: "1",
  source_url: "https://www.zhipin.com/job_detail/1.html", job_title: "AI产品经理",
  company_name: "模思", salary: "40-70K·15薪", note: "", location: "上海",
  experience: "3-5年", education: "本科", job_description: "完整JD",
  company_description: "公司介绍", missing_fields: "",
  collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
};

function fakeRepository(records: JobRecord[]): PopupRepository {
  return {
    async save(value) {
      const index = records.findIndex((record) =>
        record.source_site === value.source_site && record.source_job_id === value.source_job_id,
      );
      if (index >= 0) records[index] = value;
      else records.push(value);
    },
    async list() { return [...records]; },
    async count() { return records.length; },
    async has(value) {
      return records.some((record) =>
        record.source_site === value.source_site && record.source_job_id === value.source_job_id,
      );
    },
    async clear() { records.splice(0, records.length); },
  };
}

beforeEach(() => {
  document.body.innerHTML = `<main id="app" aria-live="polite"></main>`;
});

describe("popup view", () => {
  it("renders a compact collectable summary", () => {
    const state: PopupState = {
      kind: "collectable", count: 12, alreadyStored: false,
      record: {
        schema_version: "1", source_site: "boss", source_job_id: "1", source_url: "https://example.com",
        job_title: "AI产品经理", company_name: "模思", salary: "40-70K·15薪", note: "",
        location: "上海", experience: "3-5年", education: "本科", job_description: "完整JD",
        company_description: "", missing_fields: "company_description",
        collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
      },
    };
    renderPopup(document.querySelector("#app")!, state);
    expect(document.body.textContent).toContain("AI产品经理");
    expect(document.body.textContent).toContain("模思 · 上海 · 40-70K·15薪");
    expect(document.body.textContent).not.toContain("完整JD");
    expect(document.querySelector("[data-action=collect]")?.textContent).toBe("收集当前岗位");
  });

  it("disables export and clear when count is zero", () => {
    renderPopup(document.querySelector("#app")!, { kind: "loading", count: 0 });
    expect(document.querySelector<HTMLButtonElement>("[data-action=export]")?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("[data-action=clear]")?.disabled).toBe(true);
  });

  it("stores the complete record only after collect is clicked", async () => {
    const saved: JobRecord[] = [];
    const controller = createPopupController({
      extract: async () => ({ kind: "success", extraction: { record: sampleRecord, missingRequiredFields: [], diagnostics: [] } }),
      repository: fakeRepository(saved),
      download: vi.fn(),
      confirmClear: () => true,
      render: vi.fn(),
    });
    await controller.initialize();
    expect(saved).toEqual([]);
    await controller.collect();
    expect(saved).toEqual([sampleRecord]);
  });

  it("exports complete stored records without clearing them", async () => {
    const download = vi.fn();
    const stored = [sampleRecord];
    const controller = createPopupController({
      extract: async () => ({ kind: "unsupported-site" }),
      repository: fakeRepository(stored), download, confirmClear: () => true, render: vi.fn(),
    });
    await controller.exportCsv();
    expect(download).toHaveBeenCalledWith(stored);
    expect(stored).toHaveLength(1);
  });

  it("does not clear when confirmation is cancelled", async () => {
    const stored = [sampleRecord];
    const controller = createPopupController({
      extract: async () => ({ kind: "unsupported-site" }),
      repository: fakeRepository(stored), download: vi.fn(), confirmClear: () => false, render: vi.fn(),
    });
    await controller.clear();
    expect(stored).toHaveLength(1);
  });
});
