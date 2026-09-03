export interface SidePanelLike {
  setPanelBehavior(options: {
    openPanelOnActionClick: boolean;
  }): Promise<void>;
}

export function configureSidePanel(sidePanel: SidePanelLike): Promise<void> {
  return sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
