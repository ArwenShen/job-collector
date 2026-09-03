import { beforeEach, describe, expect, it } from "vitest";
import { renderPopup, type PopupState } from "../../src/popup/view";

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
});
