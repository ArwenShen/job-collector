import { exportJobs } from "../csv/download";
import { createJobRepository } from "../storage/job-repository";
import {
  createSidePanelController,
  type SidePanelController,
  type SidePanelRepository,
} from "./controller";
import { extractActiveTab } from "./extract-active-tab";
import { renderSidePanel } from "./view";

const TOOLTIP_MARGIN = 8;
const POINTER_OFFSET = 12;
const TOOLTIP_ID = "side-panel-tooltip";

function eventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function clamp(value: number, maximum: number): number {
  return Math.min(Math.max(TOOLTIP_MARGIN, value), Math.max(TOOLTIP_MARGIN, maximum));
}

function runAction(action: Promise<void>): void {
  void action.catch((error: unknown) => {
    console.error("Unexpected side panel action failure", error);
  });
}

export function bindSidePanelEvents(
  root: HTMLElement,
  controller: SidePanelController,
): () => void {
  let hoveredTooltipTrigger: HTMLElement | undefined;
  let focusedTooltipTrigger: HTMLElement | undefined;
  let visibleTooltipTrigger: HTMLElement | undefined;
  const addedDescription = new WeakSet<HTMLElement>();

  function tooltipPopover(): HTMLElement | null {
    const popover = root.querySelector<HTMLElement>("[data-tooltip-popover]");
    if (popover && !popover.id) popover.id = TOOLTIP_ID;
    return popover;
  }

  function removeTooltipDescription(trigger: HTMLElement): void {
    if (!addedDescription.has(trigger)) return;
    const popoverId = tooltipPopover()?.id || TOOLTIP_ID;
    const tokens = (trigger.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((token) => token && token !== popoverId);
    if (tokens.length > 0) trigger.setAttribute("aria-describedby", tokens.join(" "));
    else trigger.removeAttribute("aria-describedby");
    addedDescription.delete(trigger);
  }

  function hideTooltip(trigger = visibleTooltipTrigger): void {
    if (!trigger || trigger !== visibleTooltipTrigger) return;
    removeTooltipDescription(trigger);
    visibleTooltipTrigger = undefined;
    const popover = tooltipPopover();
    if (!popover) return;
    popover.hidden = true;
    popover.textContent = "";
  }

  function positionTooltip(left: number, top: number): void {
    const popover = tooltipPopover();
    if (!popover) return;
    const maximumLeft = document.documentElement.clientWidth - popover.offsetWidth - TOOLTIP_MARGIN;
    const maximumTop = document.documentElement.clientHeight - popover.offsetHeight - TOOLTIP_MARGIN;
    popover.style.left = `${clamp(left, maximumLeft)}px`;
    popover.style.top = `${clamp(top, maximumTop)}px`;
  }

  function showTooltip(trigger: HTMLElement): HTMLElement | null {
    const popover = tooltipPopover();
    const tooltipText = trigger.dataset.tooltip;
    if (!popover || tooltipText === undefined) return null;
    if (visibleTooltipTrigger && visibleTooltipTrigger !== trigger) hideTooltip();
    visibleTooltipTrigger = trigger;
    popover.textContent = tooltipText;
    popover.hidden = false;
    const tokens = (trigger.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!tokens.includes(popover.id)) {
      tokens.push(popover.id);
      trigger.setAttribute("aria-describedby", tokens.join(" "));
      addedDescription.add(trigger);
    }
    return popover;
  }

  function validTrigger(trigger: HTMLElement | undefined): HTMLElement | undefined {
    return trigger && root.contains(trigger) ? trigger : undefined;
  }

  function showFocusedTooltip(): void {
    focusedTooltipTrigger = validTrigger(focusedTooltipTrigger);
    if (!focusedTooltipTrigger || !showTooltip(focusedTooltipTrigger)) {
      hideTooltip();
      return;
    }
    const rect = focusedTooltipTrigger.getBoundingClientRect();
    positionTooltip(rect.left, rect.bottom + TOOLTIP_MARGIN);
  }

  function tooltipTrigger(event: Event): HTMLElement | null {
    return eventElement(event)?.closest<HTMLElement>("[data-tooltip]") ?? null;
  }

  function onClick(event: MouseEvent): void {
    const target = eventElement(event);
    const actionTarget = target?.closest<HTMLElement>("[data-action]");
    if (actionTarget && root.contains(actionTarget)) {
      const key = actionTarget.dataset.key;
      switch (actionTarget.dataset.action) {
        case "collect": runAction(controller.collect()); break;
        case "open-note": if (key !== undefined) controller.openNoteByKey(key); break;
        case "delete": if (key !== undefined) runAction(controller.deleteByKey(key)); break;
        case "undo-delete": runAction(controller.undoDelete()); break;
        case "export": runAction(controller.exportCsv()); break;
        case "request-clear": controller.requestClear(); break;
        case "cancel-clear": controller.cancelClear(); break;
        case "confirm-clear": runAction(controller.confirmClear()); break;
        case "cancel-note": controller.cancelNote(); break;
      }
      return;
    }
    if (target?.classList.contains("dialog-backdrop")) controller.cancelOverlay();
  }

  function onSubmit(event: SubmitEvent): void {
    const form = eventElement(event)?.closest<HTMLFormElement>("form[data-form=note]");
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const input = form.querySelector<HTMLTextAreaElement | HTMLInputElement>("[data-note-input]");
    if (input) runAction(controller.saveNote(input.value));
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !root.querySelector("[role=dialog], [role=alertdialog]")) return;
    event.preventDefault();
    controller.cancelOverlay();
  }

  function onPointerOver(event: PointerEvent): void {
    const trigger = tooltipTrigger(event);
    if (!trigger || !root.contains(trigger) || !showTooltip(trigger)) return;
    hoveredTooltipTrigger = trigger;
    positionTooltip(event.clientX + POINTER_OFFSET, event.clientY + POINTER_OFFSET);
  }

  function onPointerOut(event: PointerEvent): void {
    const trigger = tooltipTrigger(event);
    if (!trigger || trigger !== hoveredTooltipTrigger) return;
    if (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
    hoveredTooltipTrigger = undefined;
    showFocusedTooltip();
  }

  function onPointerMove(event: PointerEvent): void {
    const trigger = tooltipTrigger(event);
    if (trigger !== validTrigger(hoveredTooltipTrigger)) return;
    if (visibleTooltipTrigger !== trigger) showTooltip(trigger);
    positionTooltip(event.clientX + POINTER_OFFSET, event.clientY + POINTER_OFFSET);
  }

  function onFocusIn(event: FocusEvent): void {
    const trigger = tooltipTrigger(event);
    if (!trigger || !root.contains(trigger)) return;
    focusedTooltipTrigger = trigger;
    hoveredTooltipTrigger = validTrigger(hoveredTooltipTrigger);
    if (!hoveredTooltipTrigger) showFocusedTooltip();
  }

  function onFocusOut(event: FocusEvent): void {
    const trigger = tooltipTrigger(event);
    if (!trigger || trigger !== focusedTooltipTrigger) return;
    if (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
    focusedTooltipTrigger = undefined;
    hoveredTooltipTrigger = validTrigger(hoveredTooltipTrigger);
    if (!hoveredTooltipTrigger) hideTooltip();
  }

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);

  return () => {
    hideTooltip();
    hoveredTooltipTrigger = undefined;
    focusedTooltipTrigger = undefined;
    root.removeEventListener("click", onClick);
    root.removeEventListener("submit", onSubmit);
    root.removeEventListener("keydown", onKeydown);
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
  };
}

type ControllerFactory = typeof createSidePanelController;

export interface SidePanelBootstrapOptions {
  root?: HTMLElement;
  repository?: SidePanelRepository;
  createController?: ControllerFactory;
}

export function bootstrapSidePanel(options: SidePanelBootstrapOptions = {}): () => void {
  const root = options.root ?? document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Side panel root is missing");
  const controller = (options.createController ?? createSidePanelController)({
    extract: extractActiveTab,
    repository: options.repository ?? createJobRepository(),
    download: exportJobs,
    render: (state) => renderSidePanel(root, state),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
  const unbind = bindSidePanelEvents(root, controller);
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("unload", cleanup);
    window.removeEventListener("pagehide", cleanup);
    unbind();
    controller.dispose();
  };
  window.addEventListener("unload", cleanup, { once: true });
  window.addEventListener("pagehide", cleanup, { once: true });
  runAction(controller.initialize());
  return cleanup;
}

export function shouldBootstrap(): boolean {
  return typeof chrome !== "undefined"
    && Boolean(chrome.storage?.local)
    && typeof chrome.tabs?.query === "function"
    && typeof chrome.scripting?.executeScript === "function"
    && document.querySelector("#app") !== null;
}

if (shouldBootstrap()) bootstrapSidePanel();
