export interface SidePanelLike {
  setPanelBehavior(options: {
    openPanelOnActionClick: boolean;
  }): Promise<void>;
  open(options: { tabId: number }): Promise<void>;
}

export interface ActionLike {
  onClicked: {
    addListener(listener: (tab: { id?: number }) => void): void;
  };
}

export function configureSidePanel(
  action: ActionLike,
  sidePanel: SidePanelLike,
): Promise<void> {
  action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    void sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  });
  return sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}
