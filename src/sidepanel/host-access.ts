import type { SourceSite } from "../shared/job-record";

export const HOST_PERMISSION_ORIGINS: Record<SourceSite, string> = {
  boss: "https://*.zhipin.com/*",
  liepin: "https://*.liepin.com/*",
  zhaopin: "https://*.zhaopin.com/*",
  "51job": "https://*.51job.com/*",
};

export type HostAccessRequestStatus = "granted" | "denied" | "stale" | "unavailable";

interface PermissionsApi {
  request?: (permissions: { origins: string[] }) => Promise<boolean>;
}

interface TabsApi {
  query(queryInfo: { active: true; currentWindow: true }): Promise<Array<{ id?: number }>>;
}

export interface HostAccessCoordinator {
  request(site: SourceSite, tabId: number): Promise<HostAccessRequestStatus>;
  dispose(): void;
}

export function createHostAccessCoordinator(
  permissions: PermissionsApi,
  tabs: TabsApi,
): HostAccessCoordinator {
  let disposed = false;

  return {
    async request(site, tabId) {
      if (disposed || !permissions.request) return "unavailable";

      let granted: boolean;
      try {
        // This must remain the first asynchronous browser call so Chrome sees
        // the platform-button click as the permission-requesting user gesture.
        granted = await permissions.request({ origins: [HOST_PERMISSION_ORIGINS[site]] });
      } catch {
        return "unavailable";
      }
      if (disposed) return "unavailable";
      if (!granted) return "denied";

      try {
        const [activeTab] = await tabs.query({ active: true, currentWindow: true });
        if (disposed) return "unavailable";
        return activeTab?.id === tabId ? "granted" : "stale";
      } catch {
        return "stale";
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
