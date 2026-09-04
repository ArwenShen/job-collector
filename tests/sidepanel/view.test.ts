import { beforeEach, describe, expect, it } from "vitest";
import type { JobRecord, SourceSite } from "../../src/shared/job-record";
import type { SidePanelState } from "../../src/sidepanel/controller";
import { renderSidePanel } from "../../src/sidepanel/view";

const sampleRecord: JobRecord = {
  schema_version: "1", source_site: "boss", source_job_id: "1",
  source_url: "https://www.zhipin.com/job_detail/1.html", job_title: "AI产品经理",
  company_name: "模思", salary: "40-70K·15薪", note: "", location: "上海",
  experience: "3-5年", education: "本科", job_description: "完整JD",
  company_description: "公司介绍", missing_fields: "",
  collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
};

function makeRecord(source_site: SourceSite, source_job_id: string): JobRecord {
  return { ...sampleRecord, source_site, source_job_id };
}

function state(records: JobRecord[] = []): SidePanelState {
  return {
    records, clearConfirmOpen: false, busy: false, undoAvailable: false, noticeRevision: 0,
  };
}

let root: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("main");
  document.body.append(root);
});

describe("side panel view", () => {
  it("renders the permanent shell, controls, and requested table columns", () => {
    renderSidePanel(root, state([sampleRecord]));

    expect(root.querySelector(".panel-shell")).not.toBeNull();
    expect(root.querySelector("header")?.textContent).toContain("岗位收集器");
    expect(root.querySelector(".panel-collect")?.getAttribute("data-action")).toBe("collect");
    expect(root.querySelector(".panel-collect")?.textContent).toBe("收集当前职位");
    expect(root.querySelector(".count-card")?.textContent).toBe("已收集 1 个职位");
    expect(root.querySelector(".job-list-scroll [role=table]")).not.toBeNull();
    expect([...root.querySelectorAll("[role=columnheader]")].map((node) => node.textContent)).toEqual([
      "#", "平台", "公司", "职位", "薪资", "备注", "删除",
    ]);
    expect(root.querySelector(".panel-footer [data-action=export]")?.textContent).toBe("导出 CSV");
    expect(root.querySelector(".panel-footer [data-action=request-clear]")?.textContent).toBe("清空");
    const tooltip = root.querySelector<HTMLElement>("[data-tooltip-popover]");
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.id).toBe("side-panel-tooltip");
    expect(tooltip?.hidden).toBe(true);
  });

  it("collapses the feedback region when there is no notice or undo action", () => {
    renderSidePanel(root, state());

    const shell = root.querySelector(".panel-shell")!;
    const feedback = root.querySelector<HTMLElement>(".feedback-region")!;
    expect(shell.classList.contains("panel-shell--with-feedback")).toBe(false);
    expect(feedback.hidden).toBe(true);
    expect(feedback.parentElement).toBe(shell);
    expect([...shell.children].slice(0, 6).map((element) => element.className)).toEqual([
      "panel-header",
      "panel-collect",
      "count-card",
      "feedback-region",
      "job-list-scroll",
      "panel-footer",
    ]);
  });

  it("expands the feedback region for a notice", async () => {
    renderSidePanel(root, {
      ...state(), notice: { kind: "success", text: "已收集" }, noticeRevision: 1,
    });

    const shell = root.querySelector(".panel-shell")!;
    const feedback = root.querySelector<HTMLElement>(".feedback-region")!;
    expect(shell.classList.contains("panel-shell--with-feedback")).toBe(true);
    expect(feedback.hidden).toBe(false);
    expect(feedback.querySelector(".notice")?.getAttribute("aria-live")).toBe("polite");
    await Promise.resolve();
    expect(feedback.querySelector(".notice")?.textContent).toBe("已收集");
  });

  it.each([
    ["without a notice", {}],
    ["with an error notice", { notice: { kind: "error", text: "失败" }, noticeRevision: 1 }],
  ] satisfies Array<[string, Partial<SidePanelState>]>) (
    "expands feedback for undo %s",
    (_label, overrides) => {
      renderSidePanel(root, { ...state(), undoAvailable: true, ...overrides });

      const shell = root.querySelector(".panel-shell")!;
      const feedback = root.querySelector<HTMLElement>(".feedback-region")!;
      expect(shell.classList.contains("panel-shell--with-feedback")).toBe(true);
      expect(feedback.hidden).toBe(false);
      expect(feedback.querySelector("[data-action=undo-delete]")?.textContent).toBe("撤销");
      if (_label === "with an error notice") {
        expect(feedback.querySelector(".notice")?.classList.contains("notice--error")).toBe(true);
      }
    },
  );

  it.each([
    ["boss", "BOSS", "BOSS直聘"],
    ["liepin", "猎聘", "猎聘"],
    ["zhaopin", "智联", "智联招聘"],
    ["51job", "前程", "前程无忧"],
  ] as const)("maps %s to its short and full platform labels", (site, short, full) => {
    renderSidePanel(root, state([makeRecord(site, site)]));
    const platform = root.querySelector("[data-field=platform]");
    expect(platform?.textContent).toBe(short);
    expect(platform?.getAttribute("data-tooltip")).toBe(full);
    expect(platform?.getAttribute("aria-label")).toBe(full);
    expect(platform?.getAttribute("tabindex")).toBe("0");
  });

  it("renders two-digit row numbers without truncating numbers over 99", () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      makeRecord("boss", String(index + 1)),
    );
    renderSidePanel(root, state(records));
    const numbers = [...root.querySelectorAll(".job-row [data-field=index]")];
    expect(numbers[0]?.textContent).toBe("01");
    expect(numbers[8]?.textContent).toBe("09");
    expect(numbers[99]?.textContent).toBe("100");
  });

  it("stores full values and keyboard focus metadata on every descriptive cell", () => {
    const record = {
      ...sampleRecord,
      company_name: "很长的人工智能科技有限公司",
      job_title: "很长的人工智能平台产品经理职位",
      salary: "40-70K·15薪",
      note: "重点关注，等待招聘方回复",
    };
    renderSidePanel(root, state([record]));

    const expected = {
      platform: "BOSS直聘",
      company: record.company_name,
      title: record.job_title,
      salary: record.salary,
      note: record.note,
    };
    for (const [field, tooltip] of Object.entries(expected)) {
      const cell = root.querySelector(`[data-field=${field}]`);
      expect(cell?.getAttribute("data-tooltip")).toBe(tooltip);
      expect(cell?.getAttribute("tabindex")).toBe("0");
    }
  });

  it("renders missing descriptive values and an empty note with explicit fallbacks", () => {
    renderSidePanel(root, state([{
      ...sampleRecord, company_name: "", job_title: "", salary: "", note: "",
    }]));

    for (const field of ["company", "title", "salary"]) {
      const cell = root.querySelector(`[data-field=${field}]`);
      expect(cell?.textContent).toBe("—");
      expect(cell?.getAttribute("data-tooltip")).toBe("暂无信息");
    }
    const note = root.querySelector("[data-field=note]");
    expect(note?.textContent).toBe("添加");
    expect(note?.getAttribute("data-tooltip")).toBe("暂无备注");
  });

  it("puts the compound record key and values on note and delete buttons", () => {
    const record = { ...sampleRecord, source_job_id: "job:42", note: "跟进" };
    renderSidePanel(root, state([record]));

    const note = root.querySelector("[data-action=open-note]");
    expect(note?.getAttribute("data-key")).toBe("boss:job:42");
    expect(note?.textContent).toBe("跟进");
    expect(note?.getAttribute("role")).toBeNull();
    expect(note?.closest("[role=cell]")).not.toBeNull();
    const remove = root.querySelector("[data-action=delete]");
    expect(remove?.getAttribute("data-key")).toBe("boss:job:42");
    expect(remove?.getAttribute("aria-label")).toBe("删除：AI产品经理");
    expect(remove?.getAttribute("role")).toBeNull();
    expect(remove?.closest("[role=cell]")).not.toBeNull();

    renderSidePanel(root, state([{ ...record, job_title: "" }]));
    expect(root.querySelector("[data-action=delete]")?.getAttribute("aria-label"))
      .toBe("删除：未命名职位");
    expect(root.querySelector("[data-field=title]")?.tagName).not.toBe("A");
  });

  it("disables empty-list actions and disables only collect while busy", () => {
    renderSidePanel(root, { ...state(), busy: true });
    expect(root.querySelector<HTMLButtonElement>("[data-action=collect]")?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-action=export]")?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-action=request-clear]")?.disabled).toBe(true);

    renderSidePanel(root, { ...state([sampleRecord]), busy: true });
    expect(root.querySelector<HTMLButtonElement>("[data-action=collect]")?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-action=export]")?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>("[data-action=request-clear]")?.disabled).toBe(false);
  });

  it.each(["success", "error", "undo"] as const)(
    "renders undo independently of a %s notice",
    async (kind) => {
      renderSidePanel(root, {
        ...state([sampleRecord]), undoAvailable: true, notice: { kind, text: "状态消息" },
      });
      const notice = root.querySelector(".notice");
      expect(notice?.getAttribute("aria-live")).toBe("polite");
      await Promise.resolve();
      expect(notice?.textContent).toContain("状态消息");
      expect(root.querySelector("[data-action=undo-delete]")?.textContent).toBe("撤销");
      expect(notice?.classList.contains("notice--error")).toBe(kind === "error");
    },
  );

  it("renders undo even when no notice exists", () => {
    renderSidePanel(root, { ...state(), undoAvailable: true });
    expect(root.querySelector("[data-action=undo-delete]")?.textContent).toBe("撤销");
  });

  it("announces a newly rendered notice after the live region enters the DOM", async () => {
    renderSidePanel(root, state());
    renderSidePanel(root, { ...state(), notice: { kind: "success", text: "已收集当前职位" } });
    const notice = root.querySelector(".notice");
    expect(notice?.textContent).toBe("");
    await Promise.resolve();
    expect(notice?.textContent).toBe("已收集当前职位");
  });

  it("keeps one live region and announces only changed notice text", async () => {
    renderSidePanel(root, state());
    const liveRegion = root.querySelector(".notice")!;
    const effectiveUpdates: string[] = [];
    const observer = new MutationObserver(() => {
      const text = liveRegion.textContent ?? "";
      if (text) effectiveUpdates.push(text);
    });
    observer.observe(liveRegion, { childList: true, characterData: true, subtree: true });

    renderSidePanel(root, {
      ...state(), noticeRevision: 1, notice: { kind: "success", text: "第一条消息" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(root.querySelector(".notice")).toBe(liveRegion);
    expect(effectiveUpdates).toEqual(["第一条消息"]);

    renderSidePanel(root, {
      ...state(), noticeRevision: 1, notice: { kind: "success", text: "第一条消息" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(root.querySelector(".notice")).toBe(liveRegion);
    expect(effectiveUpdates).toEqual(["第一条消息"]);

    renderSidePanel(root, {
      ...state(), noticeRevision: 2, notice: { kind: "success", text: "第一条消息" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(effectiveUpdates).toEqual(["第一条消息", "第一条消息"]);

    renderSidePanel(root, {
      ...state(), noticeRevision: 3, notice: { kind: "error", text: "第二条消息" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(effectiveUpdates).toEqual(["第一条消息", "第一条消息", "第二条消息"]);
    observer.disconnect();
  });

  it("renders and focuses the note dialog with its editing constraints", async () => {
    renderSidePanel(root, {
      ...state([sampleRecord]),
      noteEditor: { key: "boss:1", value: "重点" },
      clearConfirmOpen: true,
    });

    const dialog = root.querySelector("[data-dialog=note]");
    const textarea = root.querySelector<HTMLTextAreaElement>("[data-note-input]");
    expect(dialog?.classList.contains("dialog-card")).toBe(true);
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const titleId = dialog?.getAttribute("aria-labelledby");
    expect(titleId).toBe("note-dialog-title");
    expect(root.querySelector(`#${titleId}`)?.textContent).toBe("编辑职位备注");
    expect(dialog?.textContent).toContain("职位备注");
    expect(root.querySelector("[data-form=note]")).not.toBeNull();
    expect(textarea?.value).toBe("重点");
    expect(textarea?.maxLength).toBe(200);
    expect(root.querySelector("[data-action=cancel-note]")?.getAttribute("type")).toBe("button");
    expect(root.querySelector("[data-form=note] button[type=submit]")?.textContent).toBe("保存");
    expect(root.querySelector("[data-dialog=clear]")).toBeNull();
    await Promise.resolve();
    expect(document.activeElement).toBe(textarea);
  });

  it("renders and least-destructively focuses the clear alert dialog", async () => {
    renderSidePanel(root, { ...state([sampleRecord]), clearConfirmOpen: true });

    const dialog = root.querySelector("[data-dialog=clear]");
    const cancel = root.querySelector<HTMLButtonElement>("[data-action=cancel-clear]");
    expect(dialog?.getAttribute("role")).toBe("alertdialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const titleId = dialog?.getAttribute("aria-labelledby");
    const descriptionId = dialog?.getAttribute("aria-describedby");
    expect(titleId).toBe("clear-dialog-title");
    expect(root.querySelector(`#${titleId}`)?.textContent).toBe("清空已收集职位");
    expect(descriptionId).toBe("clear-dialog-description");
    expect(root.querySelector(`#${descriptionId}`)?.textContent)
      .toBe("确定清空已收集的 1 个职位吗？此操作无法撤销。");
    expect(dialog?.textContent).toContain("确定清空已收集的 1 个职位吗？此操作无法撤销。");
    expect(cancel).not.toBeNull();
    expect(root.querySelector("[data-action=confirm-clear]")).not.toBeNull();
    expect(root.querySelector("[data-dialog=note]")).toBeNull();
    await Promise.resolve();
    expect(document.activeElement).toBe(cancel);
  });

  it("renders extracted markup-like strings only as inert text", () => {
    const attack = `<img src=x onerror="globalThis.pwned=true"><script>bad()</script>`;
    renderSidePanel(root, state([{
      ...sampleRecord,
      company_name: attack,
      job_title: attack,
      salary: attack,
      note: attack,
    }]));

    expect(root.textContent).toContain(attack);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("[data-field=company]")?.getAttribute("data-tooltip")).toBe(attack);
  });

  it("fully replaces old DOM on repeated rendering", () => {
    renderSidePanel(root, state([sampleRecord]));
    const oldShell = root.querySelector(".panel-shell")!;
    const marker = document.createElement("span");
    marker.setAttribute("data-stale", "true");
    oldShell.append(marker);

    renderSidePanel(root, state());

    expect(oldShell.isConnected).toBe(false);
    expect(root.querySelector("[data-stale]")).toBeNull();
    expect(root.querySelectorAll(".panel-shell")).toHaveLength(1);
    expect(root.querySelector(".count-card")?.textContent).toBe("已收集 0 个职位");
  });

  it.each(["company", "note"] as const)(
    "restores focus to the same keyed %s control after rendering",
    async (field) => {
      const records = [sampleRecord, { ...sampleRecord, source_job_id: "2", company_name: "第二家公司" }];
      renderSidePanel(root, state(records));
      const selector = `[data-key="boss:2"][data-field=${field}]`;
      const oldTarget = root.querySelector<HTMLElement>(selector)!;
      oldTarget.focus();
      expect(document.activeElement).toBe(oldTarget);

      renderSidePanel(root, state(records));
      const newTarget = root.querySelector<HTMLElement>(selector)!;
      expect(newTarget).not.toBe(oldTarget);
      await Promise.resolve();
      expect(document.activeElement).toBe(newTarget);
    },
  );

  it("lets an opening dialog take focus instead of restoring the old row focus", async () => {
    renderSidePanel(root, state([sampleRecord]));
    root.querySelector<HTMLElement>("[data-field=company]")!.focus();

    renderSidePanel(root, {
      ...state([sampleRecord]), noteEditor: { key: "boss:1", value: "重点" },
    });
    await Promise.resolve();

    expect(document.activeElement).toBe(root.querySelector("[data-note-input]"));
  });

  it("returns focus to the note trigger after the note dialog closes", async () => {
    renderSidePanel(root, state([sampleRecord]));
    root.querySelector<HTMLElement>("[data-action=open-note]")!.focus();
    renderSidePanel(root, {
      ...state([sampleRecord]), noteEditor: { key: "boss:1", value: "重点" },
    });
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-note-input]"));

    renderSidePanel(root, state([sampleRecord]));
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-action=open-note]"));
  });

  it("returns focus to the clear trigger after the clear dialog closes", async () => {
    renderSidePanel(root, state([sampleRecord]));
    root.querySelector<HTMLElement>("[data-action=request-clear]")!.focus();
    renderSidePanel(root, { ...state([sampleRecord]), clearConfirmOpen: true });
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-action=cancel-clear]"));

    renderSidePanel(root, state([sampleRecord]));
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-action=request-clear]"));
  });

  it("defers restoring collect focus until the button is enabled again", async () => {
    renderSidePanel(root, state([sampleRecord]));
    root.querySelector<HTMLElement>("[data-action=collect]")!.focus();

    renderSidePanel(root, { ...state([sampleRecord]), busy: true });
    await Promise.resolve();
    expect(root.querySelector<HTMLButtonElement>("[data-action=collect]")?.disabled).toBe(true);
    expect(document.activeElement).not.toBe(root.querySelector("[data-action=collect]"));

    renderSidePanel(root, state([sampleRecord]));
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-action=collect]"));
  });

  it("abandons a disabled clear trigger and does not restore it on a later render", async () => {
    renderSidePanel(root, state([sampleRecord]));
    root.querySelector<HTMLElement>("[data-action=request-clear]")!.focus();
    renderSidePanel(root, { ...state([sampleRecord]), clearConfirmOpen: true });
    await Promise.resolve();

    renderSidePanel(root, { ...state(), busy: true });
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector(".panel-shell"));

    renderSidePanel(root, state());
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-action=collect]"));

    renderSidePanel(root, state([sampleRecord]));
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector("[data-action=collect]"));
    expect(document.activeElement).not.toBe(root.querySelector("[data-action=request-clear]"));
  });
});
