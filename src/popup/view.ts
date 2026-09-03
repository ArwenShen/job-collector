import type { JobRecord } from "../shared/job-record";

export type PopupState =
  | { kind: "loading"; count: number }
  | { kind: "collectable"; count: number; record: JobRecord; alreadyStored: boolean; message?: string }
  | { kind: "not-detail"; count: number }
  | { kind: "failed"; count: number; missing: string[]; message?: string };

export function renderPopup(root: Element, state: PopupState): void {
  root.replaceChildren();
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "岗位收集器";
  const count = document.createElement("span");
  count.textContent = `已收集 ${state.count}`;
  header.append(title, count);

  const content = document.createElement("section");
  content.className = "job-card";
  if (state.kind === "collectable") {
    const status = document.createElement("p");
    status.className = "status";
    status.textContent = `${state.record.source_site} · ${state.alreadyStored ? "已收集" : "已识别"}`;
    const name = document.createElement("h1");
    name.textContent = state.record.job_title;
    name.title = state.record.job_title;
    const summary = document.createElement("p");
    summary.textContent = [state.record.company_name, state.record.location, state.record.salary]
      .filter(Boolean).join(" · ");
    content.append(status, name, summary);
    if (state.message) {
      const feedback = document.createElement("p");
      feedback.className = "feedback";
      feedback.textContent = state.message;
      content.append(feedback);
    }
  } else {
    content.textContent = state.kind === "loading"
      ? "正在读取当前页面…"
      : state.kind === "not-detail"
        ? "请打开支持平台的职位详情页"
        : state.message ?? `无法完整识别该岗位：缺少 ${state.missing.join("、")}`;
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  if (state.kind === "collectable") {
    const collect = document.createElement("button");
    collect.dataset.action = "collect";
    collect.textContent = state.alreadyStored ? "更新当前岗位" : "收集当前岗位";
    actions.append(collect);
  }
  const exportButton = document.createElement("button");
  exportButton.dataset.action = "export";
  exportButton.textContent = "导出 CSV";
  exportButton.disabled = state.count === 0;
  const clear = document.createElement("button");
  clear.dataset.action = "clear";
  clear.textContent = "清空";
  clear.disabled = state.count === 0;
  actions.append(exportButton, clear);
  root.append(header, content, actions);
}
