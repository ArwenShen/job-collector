import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindSidePanelEvents } from "../../src/sidepanel/index";

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
});
