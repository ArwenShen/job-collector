import { extractCurrentPage } from "../extractors";

declare global {
  var __JOB_COLLECTOR_RESULT__: ReturnType<typeof extractCurrentPage> | undefined;
}

globalThis.__JOB_COLLECTOR_RESULT__ = extractCurrentPage(
  new URL(globalThis.location.href),
  document,
  chrome.runtime.getManifest().version,
);
