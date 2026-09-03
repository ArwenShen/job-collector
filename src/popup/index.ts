import { exportJobs } from "../csv/download";
import { createJobRepository } from "../storage/job-repository";
import { createPopupController, extractActiveTab } from "./controller";
import { renderPopup } from "./view";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Popup root is missing");

const repository = createJobRepository();
const controller = createPopupController({
  extract: extractActiveTab,
  repository,
  download: exportJobs,
  confirmClear: () => globalThis.confirm("确定清空所有已收集岗位吗？此操作无法撤销。"),
  render: (state) => renderPopup(root, state),
});

renderPopup(root, { kind: "loading", count: 0 });

root.addEventListener("click", (event) => {
  const action = (event.target as Element).closest<HTMLButtonElement>("button[data-action]")?.dataset.action;
  if (action === "collect") void controller.collect();
  if (action === "export") void controller.exportCsv();
  if (action === "clear") void controller.clear();
});

void controller.initialize();
