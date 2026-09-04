import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJobs } from "../../src/csv/download";
import { createSidePanelController, type SidePanelRepository } from "../../src/sidepanel/controller";
import { extractActiveTab } from "../../src/sidepanel/extract-active-tab";
import { bindSidePanelEvents, bootstrapSidePanel, shouldBootstrap } from "../../src/sidepanel/index";

function createController() {
  return {
    initialize: vi.fn(async () => undefined),
    collect: vi.fn(async () => undefined),
    exportCsv: vi.fn(async () => undefined),
    openNote: vi.fn(),
    openNoteByKey: vi.fn(),
    deleteRecord: vi.fn(async () => undefined),
    deleteByKey: vi.fn(async () => undefined),
    undoDelete: vi.fn(async () => undefined),
    requestClear: vi.fn(),
    cancelClear: vi.fn(),
    confirmClear: vi.fn(async () => undefined),
    cancelNote: vi.fn(),
    saveNote: vi.fn(async () => undefined),
    cancelOverlay: vi.fn(),
    dispose: vi.fn(),
  };
}

function button(action: string, key?: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.dataset.action = action;
  if (key !== undefined) element.dataset.key = key;
  return element;
}

let root: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("main");
  document.body.append(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("side panel event binding", () => {
  it.each([
    ["collect", "collect"],
    ["undo-delete", "undoDelete"],
    ["export", "exportCsv"],
    ["request-clear", "requestClear"],
    ["cancel-clear", "cancelClear"],
    ["confirm-clear", "confirmClear"],
    ["cancel-note", "cancelNote"],
  ] as const)("routes %s clicks", (action, method) => {
    const controller = createController();
    bindSidePanelEvents(root, controller);
    const target = button(action);
    const child = document.createElement("span");
    target.append(child);
    root.append(target);

    child.click();

    expect(controller[method]).toHaveBeenCalledOnce();
  });

  it.each([
    ["open-note", "openNoteByKey"],
    ["delete", "deleteByKey"],
  ] as const)("routes %s with its composite key", (action, method) => {
    const controller = createController();
    bindSidePanelEvents(root, controller);
    const target = button(action, "boss:123");
    root.append(target);

    target.click();

    expect(controller[method]).toHaveBeenCalledWith("boss:123");
  });

  it("submits the current note value and prevents native form submission", () => {
    const controller = createController();
    bindSidePanelEvents(root, controller);
    const form = document.createElement("form");
    form.dataset.form = "note";
    const input = document.createElement("textarea");
    input.dataset.noteInput = "";
    input.value = "  follow up  ";
    form.append(input);
    root.append(form);
    const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });

    form.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(controller.saveNote).toHaveBeenCalledWith("  follow up  ");
  });

  it("cancels an open dialog on Escape but leaves Escape alone without a dialog", () => {
    const controller = createController();
    bindSidePanelEvents(root, controller);
    const withoutDialog = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    root.dispatchEvent(withoutDialog);
    expect(withoutDialog.defaultPrevented).toBe(false);
    expect(controller.cancelOverlay).not.toHaveBeenCalled();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    root.append(dialog);
    const withDialog = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    dialog.dispatchEvent(withDialog);
    expect(withDialog.defaultPrevented).toBe(true);
    expect(controller.cancelOverlay).toHaveBeenCalledOnce();
  });

  it("cancels only clicks on the dialog backdrop itself", () => {
    const controller = createController();
    bindSidePanelEvents(root, controller);
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    const card = document.createElement("div");
    card.className = "dialog-card";
    backdrop.append(card);
    root.append(backdrop);

    card.click();
    expect(controller.cancelOverlay).not.toHaveBeenCalled();
    backdrop.click();
    expect(controller.cancelOverlay).toHaveBeenCalledOnce();
  });

  it("removes every listener when unbound", () => {
    const controller = createController();
    const unbind = bindSidePanelEvents(root, controller);
    const collect = button("collect");
    const trigger = document.createElement("div");
    trigger.dataset.tooltip = "details";
    const popover = document.createElement("div");
    popover.dataset.tooltipPopover = "";
    popover.hidden = true;
    root.append(collect, trigger, popover);
    unbind();

    collect.click();
    trigger.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));

    expect(controller.collect).not.toHaveBeenCalled();
    expect(popover.hidden).toBe(true);
  });

  it.each([
    ["collect", "collect"],
    ["delete", "deleteByKey"],
    ["undo-delete", "undoDelete"],
    ["export", "exportCsv"],
    ["confirm-clear", "confirmClear"],
  ] as const)("catches rejected %s actions", async (action, method) => {
    const controller = createController();
    controller[method].mockRejectedValue(new Error(`${action} failed`));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bindSidePanelEvents(root, controller);
    const target = button(action, "boss:1");
    root.append(target);

    target.click();
    await Promise.resolve();
    controller[method].mockResolvedValue(undefined);
    target.click();
    await Promise.resolve();

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      "Unexpected side panel action failure",
      expect.objectContaining({ message: `${action} failed` }),
    );
    expect(controller[method]).toHaveBeenCalledTimes(2);
  });

  it("catches rejected note submissions", async () => {
    const controller = createController();
    controller.saveNote.mockRejectedValue(new Error("save failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bindSidePanelEvents(root, controller);
    const form = document.createElement("form");
    form.dataset.form = "note";
    const input = document.createElement("textarea");
    input.dataset.noteInput = "";
    form.append(input);
    root.append(form);

    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    controller.saveNote.mockResolvedValue(undefined);
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      "Unexpected side panel action failure",
      expect.objectContaining({ message: "save failed" }),
    );
    expect(controller.saveNote).toHaveBeenCalledTimes(2);
  });

  it("leaves click routing active after the renderer replaces root contents", () => {
    const controller = createController();
    bindSidePanelEvents(root, controller);
    root.replaceChildren(button("collect"));
    root.querySelector<HTMLButtonElement>("[data-action=collect]")?.click();
    root.replaceChildren(button("export"));
    root.querySelector<HTMLButtonElement>("[data-action=export]")?.click();

    expect(controller.collect).toHaveBeenCalledOnce();
    expect(controller.exportCsv).toHaveBeenCalledOnce();
  });

  it("unbinds submit, keyboard, pointer, and focus listeners", () => {
    const controller = createController();
    const form = document.createElement("form");
    form.dataset.form = "note";
    const input = document.createElement("textarea");
    input.dataset.noteInput = "";
    form.append(input);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const trigger = document.createElement("button");
    trigger.dataset.tooltip = "details";
    const popover = document.createElement("div");
    popover.id = "side-panel-tooltip";
    popover.dataset.tooltipPopover = "";
    root.append(form, dialog, trigger, popover);
    const unbind = bindSidePanelEvents(root, controller);
    unbind();
    popover.hidden = false;
    popover.textContent = "unchanged";
    popover.style.left = "17px";

    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, clientX: 80, clientY: 60 }));
    trigger.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 90, clientY: 70 }));
    trigger.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: root }));
    trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    trigger.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: root }));

    expect(controller.saveNote).not.toHaveBeenCalled();
    expect(controller.cancelOverlay).not.toHaveBeenCalled();
    expect(popover.hidden).toBe(false);
    expect(popover.textContent).toBe("unchanged");
    expect(popover.style.left).toBe("17px");
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("side panel tooltip", () => {
  function mountTooltip(originalDescription = "") {
    const first = document.createElement("button");
    first.dataset.tooltip = "完整职位名称";
    if (originalDescription) first.setAttribute("aria-describedby", originalDescription);
    const second = document.createElement("button");
    second.dataset.tooltip = "第二条详情";
    const popover = document.createElement("div");
    popover.id = "side-panel-tooltip";
    popover.dataset.tooltipPopover = "";
    popover.hidden = true;
    root.append(first, second, popover);
    return { first, second, popover };
  }

  it("shows and hides on pointer entry/exit while preserving other describedby tokens", () => {
    bindSidePanelEvents(root, createController());
    const { first, popover } = mountTooltip("existing-help");

    first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(popover.hidden).toBe(false);
    expect(popover.textContent).toBe("完整职位名称");
    expect(first.getAttribute("aria-describedby")?.split(/\s+/)).toEqual([
      "existing-help", "side-panel-tooltip",
    ]);

    const inside = document.createElement("span");
    first.append(inside);
    first.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: inside }));
    expect(popover.hidden).toBe(false);
    first.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: root }));
    expect(popover.hidden).toBe(true);
    expect(popover.textContent).toBe("");
    expect(first.getAttribute("aria-describedby")).toBe("existing-help");
  });

  it("switches active triggers and removes the token it added to the old trigger", () => {
    bindSidePanelEvents(root, createController());
    const { first, second, popover } = mountTooltip();
    first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    second.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));

    expect(first.hasAttribute("aria-describedby")).toBe(false);
    expect(second.getAttribute("aria-describedby")).toBe("side-panel-tooltip");
    expect(popover.textContent).toBe("第二条详情");
  });

  it("shows at the trigger for focus and stays visible while focus remains inside", () => {
    bindSidePanelEvents(root, createController());
    const { first, popover } = mountTooltip();
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
    });
    Object.defineProperty(first, "getBoundingClientRect", {
      value: () => ({ left: 20, top: 10, right: 50, bottom: 30, width: 30, height: 20, x: 20, y: 10, toJSON() {} }),
    });
    const inside = document.createElement("span");
    first.append(inside);

    first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(popover.hidden).toBe(false);
    expect(popover.style.left).toBe("20px");
    expect(popover.style.top).toBe("38px");
    first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: inside }));
    expect(popover.hidden).toBe(false);
    first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: root }));
    expect(popover.hidden).toBe(true);
  });

  it("tracks the pointer and clamps the popover inside the side panel viewport", () => {
    bindSidePanelEvents(root, createController());
    const { first, popover } = mountTooltip();
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 80 },
    });
    Object.defineProperties(popover, {
      offsetWidth: { configurable: true, value: 30 },
      offsetHeight: { configurable: true, value: 20 },
    });

    first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    first.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 95, clientY: 75 }));

    expect(popover.style.left).toBe("62px");
    expect(popover.style.top).toBe("52px");
  });

  it("positions and clamps from pointerover coordinates before any pointermove", () => {
    bindSidePanelEvents(root, createController());
    const { first, popover } = mountTooltip();
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 80 },
    });
    Object.defineProperties(popover, {
      offsetWidth: { configurable: true, value: 30 },
      offsetHeight: { configurable: true, value: 20 },
    });

    first.dispatchEvent(new MouseEvent("pointerover", {
      bubbles: true, clientX: 95, clientY: 75,
    }));

    expect(popover.hidden).toBe(false);
    expect(popover.style.left).toBe("62px");
    expect(popover.style.top).toBe("52px");
  });

  it("keeps a focused tooltip after its matching pointer leaves", () => {
    bindSidePanelEvents(root, createController());
    const { first, popover } = mountTooltip();
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
    });
    Object.defineProperty(first, "getBoundingClientRect", {
      value: () => ({ left: 20, top: 10, right: 50, bottom: 30, width: 30, height: 20, x: 20, y: 10, toJSON() {} }),
    });

    first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, clientX: 70, clientY: 60 }));
    first.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: root }));

    expect(popover.hidden).toBe(false);
    expect(popover.textContent).toBe("完整职位名称");
    expect(popover.style.left).toBe("20px");
    expect(popover.style.top).toBe("38px");
    expect(first.getAttribute("aria-describedby")).toBe("side-panel-tooltip");
  });

  it("keeps the pointer-positioned tooltip after focus leaves the same trigger", () => {
    bindSidePanelEvents(root, createController());
    const { first, popover } = mountTooltip();
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
    });

    first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, clientX: 30, clientY: 20 }));
    first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: root }));

    expect(popover.hidden).toBe(false);
    expect(popover.textContent).toBe("完整职位名称");
    expect(popover.style.left).toBe("42px");
    expect(popover.style.top).toBe("32px");
    expect(first.getAttribute("aria-describedby")).toBe("side-panel-tooltip");
  });

  it("restores the focused trigger after a different hovered trigger leaves", () => {
    bindSidePanelEvents(root, createController());
    const { first, second, popover } = mountTooltip();
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 200 },
    });
    Object.defineProperty(first, "getBoundingClientRect", {
      value: () => ({ left: 24, top: 12, right: 54, bottom: 32, width: 30, height: 20, x: 24, y: 12, toJSON() {} }),
    });

    first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    second.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, clientX: 80, clientY: 70 }));
    expect(popover.textContent).toBe("第二条详情");
    expect(first.hasAttribute("aria-describedby")).toBe(false);
    expect(second.getAttribute("aria-describedby")).toBe("side-panel-tooltip");

    second.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: root }));
    expect(popover.hidden).toBe(false);
    expect(popover.textContent).toBe("完整职位名称");
    expect(popover.style.left).toBe("24px");
    expect(popover.style.top).toBe("40px");
    expect(first.getAttribute("aria-describedby")).toBe("side-panel-tooltip");
    expect(second.hasAttribute("aria-describedby")).toBe(false);

    first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: root }));
    expect(popover.hidden).toBe(true);
    expect(popover.textContent).toBe("");
    expect(first.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("side panel bootstrap", () => {
  const repository = {} as SidePanelRepository;

  it("binds before initialize and injects bound global timers", async () => {
    const controller = createController();
    const add = vi.spyOn(root, "addEventListener");
    const captured: Array<Parameters<typeof createSidePanelController>[0]> = [];
    const controllerFactory = vi.fn((deps: Parameters<typeof createSidePanelController>[0]) => {
      captured.push(deps);
      return controller;
    });

    const cleanup = bootstrapSidePanel({ root, repository, createController: controllerFactory });
    await Promise.resolve();

    expect(add).toHaveBeenCalled();
    expect(add.mock.invocationCallOrder[0]).toBeLessThan(controller.initialize.mock.invocationCallOrder[0]!);
    const deps = captured[0];
    expect(deps?.setTimeout).toBeTypeOf("function");
    expect(deps?.clearTimeout).toBeTypeOf("function");
    expect(deps?.setTimeout).not.toBe(globalThis.setTimeout);
    expect(deps?.clearTimeout).not.toBe(globalThis.clearTimeout);
    expect(deps?.extract).toBe(extractActiveTab);
    expect(deps?.repository).toBe(repository);
    expect(deps?.download).toBe(exportJobs);
    expect(deps?.render).toBeTypeOf("function");
    deps?.render({
      records: [], noticeRevision: 0, clearConfirmOpen: false,
      busy: false, undoAvailable: false,
    });
    expect(root.querySelector(".panel-shell")).not.toBeNull();
    cleanup();
  });

  it.each([
    ["pagehide", "unload"],
    ["unload", "pagehide"],
  ] as const)("unbinds and disposes once when %s fires before %s", (first, second) => {
    const controller = createController();
    const remove = vi.spyOn(root, "removeEventListener");
    const cleanup = bootstrapSidePanel({
      root, repository, createController: vi.fn(() => controller),
    });

    window.dispatchEvent(new Event(first));
    window.dispatchEvent(new Event(second));
    cleanup();

    expect(controller.dispose).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledTimes(8);
  });

  it("does not auto-bootstrap when Chrome exists without the side panel root", async () => {
    document.body.replaceChildren();
    vi.stubGlobal("chrome", {
      storage: { local: {} },
      tabs: { query: vi.fn() },
      scripting: { executeScript: vi.fn() },
    });

    expect(shouldBootstrap()).toBe(false);
    vi.resetModules();
    await expect(import("../../src/sidepanel/index")).resolves.toBeDefined();
  });
});
