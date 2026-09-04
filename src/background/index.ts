import { configureSidePanel } from "./configure-side-panel";

void configureSidePanel(chrome.action, chrome.sidePanel).catch(() => undefined);
