import type { JobRecord } from "../shared/job-record";
import type { SidePanelState } from "./controller";

const PLATFORM_LABELS = {
  boss: { short: "BOSS", full: "BOSS直聘" },
  liepin: { short: "猎聘", full: "猎聘" },
  zhaopin: { short: "智联", full: "智联招聘" },
  "51job": { short: "前程", full: "前程无忧" },
} as const;

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

function recordKey(record: Pick<JobRecord, "source_site" | "source_job_id">): string {
  return `${record.source_site}:${record.source_job_id}`;
}

interface FocusIdentity {
  action: string | null;
  field: string | null;
  key: string | null;
}

function captureFocusIdentity(root: Element): FocusIdentity | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return undefined;
  const identity = {
    action: active.getAttribute("data-action"),
    field: active.getAttribute("data-field"),
    key: active.getAttribute("data-key"),
  };
  return identity.action || (identity.field && identity.key) ? identity : undefined;
}

function restoreFocus(root: Element, identity: FocusIdentity): void {
  const candidates = root.querySelectorAll<HTMLElement>("[data-action], [data-key]");
  const target = [...candidates].find((candidate) =>
    candidate.getAttribute("data-action") === identity.action
    && candidate.getAttribute("data-field") === identity.field
    && candidate.getAttribute("data-key") === identity.key,
  );
  if (target?.isConnected) target.focus();
}

function createTextCell(field: string, value: string, key: string): HTMLElement {
  const visibleValue = value || "—";
  const tooltipValue = value || "暂无信息";
  return createElement("div", {
    class: "cell truncate",
    role: "cell",
    "data-field": field,
    "data-key": key,
    tabindex: "0",
    "data-tooltip": tooltipValue,
  }, visibleValue);
}

function createJobRow(record: JobRecord, index: number): HTMLElement {
  const row = createElement("div", { class: "job-row", role: "row" });
  const number = createElement("div", {
    class: "cell cell--index",
    role: "cell",
    "data-field": "index",
  }, String(index + 1).padStart(2, "0"));
  const platform = PLATFORM_LABELS[record.source_site];
  const key = recordKey(record);
  const platformCell = createTextCell("platform", platform.short, key);
  platformCell.setAttribute("data-tooltip", platform.full);
  platformCell.setAttribute("aria-label", platform.full);

  const note = createElement("button", {
    class: "truncate",
    type: "button",
    "data-field": "note",
    "data-tooltip": record.note || "暂无备注",
    "data-action": "open-note",
    "data-key": key,
    tabindex: "0",
  }, record.note || "添加");
  const remove = createElement("button", {
    type: "button",
    "data-action": "delete",
    "data-key": key,
    "aria-label": `删除：${record.job_title || "未命名职位"}`,
  }, "删除");

  const noteCell = createElement("div", { class: "cell", role: "cell" });
  noteCell.append(note);
  const removeCell = createElement("div", { class: "cell cell--delete", role: "cell" });
  removeCell.append(remove);

  row.append(
    number,
    platformCell,
    createTextCell("company", record.company_name, key),
    createTextCell("title", record.job_title, key),
    createTextCell("salary", record.salary, key),
    noteCell,
    removeCell,
  );
  return row;
}

function createNotice(state: SidePanelState): HTMLElement {
  const notice = createElement("div", { class: "notice", "aria-live": "polite" });
  if (state.notice?.kind === "error") notice.setAttribute("class", "notice notice--error");
  if (state.notice) {
    const message = createElement("span");
    const text = state.notice.text;
    notice.append(message);
    queueMicrotask(() => {
      if (message.isConnected) message.textContent = text;
    });
  }
  if (state.undoAvailable) {
    const undo = createElement("button", {
      type: "button",
      "data-action": "undo-delete",
    }, "撤销");
    notice.append(undo);
  }
  return notice;
}

function createTable(records: JobRecord[]): HTMLElement {
  const scroll = createElement("div", { class: "job-list-scroll" });
  const table = createElement("div", { class: "job-table", role: "table" });
  const header = createElement("div", { class: "job-header", role: "row" });
  for (const label of ["#", "平台", "公司", "职位", "薪资", "备注", "删除"]) {
    header.append(createElement("div", { class: "cell", role: "columnheader" }, label));
  }
  const body = createElement("div", { class: "job-table-body", role: "rowgroup" });
  records.forEach((record, index) => body.append(createJobRow(record, index)));
  table.append(header, body);
  scroll.append(table);
  return scroll;
}

function createNoteDialog(editor: NonNullable<SidePanelState["noteEditor"]>): HTMLElement {
  const backdrop = createElement("div", { class: "dialog-backdrop" });
  const form = createElement("form", {
    class: "dialog-card",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "note-dialog-title",
    "data-dialog": "note",
    "data-form": "note",
  });
  const title = createElement("h2", { id: "note-dialog-title" }, "编辑职位备注");
  const label = createElement("label", { for: "job-note-input" }, "职位备注");
  const textarea = createElement("textarea", {
    id: "job-note-input",
    "data-note-input": "",
    maxlength: "200",
  });
  textarea.setAttribute("value", editor.value);
  textarea.textContent = editor.value;
  const actions = createElement("div", { class: "dialog-actions" });
  actions.append(
    createElement("button", { type: "button", "data-action": "cancel-note" }, "取消"),
    createElement("button", { type: "submit" }, "保存"),
  );
  form.append(title, label, textarea, actions);
  backdrop.append(form);
  queueMicrotask(() => {
    if (textarea.isConnected) textarea.focus();
  });
  return backdrop;
}

function createClearDialog(count: number): HTMLElement {
  const backdrop = createElement("div", { class: "dialog-backdrop" });
  const dialog = createElement("div", {
    class: "dialog-card",
    role: "alertdialog",
    "aria-modal": "true",
    "aria-labelledby": "clear-dialog-title",
    "aria-describedby": "clear-dialog-description",
    "data-dialog": "clear",
  });
  const title = createElement("h2", { id: "clear-dialog-title" }, "清空已收集职位");
  const message = createElement(
    "p",
    { id: "clear-dialog-description" },
    `确定清空已收集的 ${count} 个职位吗？此操作无法撤销。`,
  );
  const actions = createElement("div", { class: "dialog-actions" });
  const cancel = createElement("button", {
    type: "button",
    "data-action": "cancel-clear",
  }, "取消");
  const confirm = createElement("button", {
    type: "button",
    "data-action": "confirm-clear",
  }, "确认清空");
  actions.append(cancel, confirm);
  dialog.append(title, message, actions);
  backdrop.append(dialog);
  queueMicrotask(() => {
    if (cancel.isConnected) cancel.focus();
  });
  return backdrop;
}

export function renderSidePanel(root: Element, state: SidePanelState): void {
  const focusIdentity = captureFocusIdentity(root);
  const shell = createElement("div", { class: "panel-shell" });
  const header = createElement("header", { class: "panel-header" });
  header.append(createElement("strong", {}, "岗位收集器"));

  const collect = createElement("button", {
    class: "panel-collect",
    type: "button",
    "data-action": "collect",
  }, "收集当前职位");
  if (state.busy) collect.setAttribute("disabled", "");

  const count = createElement("div", { class: "count-card" }, `已收集 ${state.records.length} 个职位`);
  const footer = createElement("footer", { class: "panel-footer" });
  const exportButton = createElement("button", {
    type: "button",
    "data-action": "export",
  }, "导出 CSV");
  const clearButton = createElement("button", {
    type: "button",
    "data-action": "request-clear",
  }, "清空");
  if (state.records.length === 0) {
    exportButton.setAttribute("disabled", "");
    clearButton.setAttribute("disabled", "");
  }
  footer.append(exportButton, clearButton);

  const tooltip = createElement("div", {
    id: "side-panel-tooltip",
    role: "tooltip",
    "data-tooltip-popover": "",
    hidden: "",
  });
  shell.append(header, collect, count, createNotice(state), createTable(state.records), footer, tooltip);
  if (state.noteEditor) shell.append(createNoteDialog(state.noteEditor));
  else if (state.clearConfirmOpen) shell.append(createClearDialog(state.records.length));

  root.replaceChildren(shell);
  if (!state.noteEditor && !state.clearConfirmOpen && focusIdentity) {
    queueMicrotask(() => restoreFocus(root, focusIdentity));
  }
}
