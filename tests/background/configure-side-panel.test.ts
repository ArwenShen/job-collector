import { describe, expect, it, vi } from "vitest";

import { configureSidePanel } from "../../src/background/configure-side-panel";

describe("configureSidePanel", () => {
  it("opens the clicked tab's side panel from the action event", async () => {
    let onClicked: ((tab: { id?: number }) => void) | undefined;
    const action = {
      onClicked: {
        addListener: vi.fn((listener: (tab: { id?: number }) => void) => {
          onClicked = listener;
        }),
      },
    };
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn().mockResolvedValue(undefined);

    await configureSidePanel(action, { setPanelBehavior, open });

    expect(setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
    expect(action.onClicked.addListener).toHaveBeenCalledOnce();

    onClicked?.({ id: 42 });
    await Promise.resolve();

    expect(open).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("registers the action listener before the behavior update resolves", () => {
    const action = {
      onClicked: {
        addListener: vi.fn(),
      },
    };
    const setPanelBehavior = vi.fn(() => new Promise<void>(() => undefined));

    void configureSidePanel(action, {
      setPanelBehavior,
      open: vi.fn().mockResolvedValue(undefined),
    });

    expect(action.onClicked.addListener).toHaveBeenCalledOnce();
  });
});
