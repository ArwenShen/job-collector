import { describe, expect, it, vi } from "vitest";

import { configureSidePanel } from "../../src/background/configure-side-panel";

describe("configureSidePanel", () => {
  it("opens the side panel when the extension action is clicked", async () => {
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined);

    await configureSidePanel({ setPanelBehavior });

    expect(setPanelBehavior).toHaveBeenCalledOnce();
    expect(setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });
});
