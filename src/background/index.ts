import { configureSidePanel } from "./configure-side-panel";

void configureSidePanel(chrome.sidePanel).catch(() => undefined);
