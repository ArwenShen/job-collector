export type HostAccessRequestStatus = "requested" | "unavailable";
export type HostAccessEvent =
  | { kind: "granted"; tabId: number }
  | { kind: "stale"; tabId: number };

interface ChromeEvent<T extends (...args: any[]) => void> {
  addListener(listener: T): void;
  removeListener(listener: T): void;
}

interface PermissionsApi {
  addHostAccessRequest?: (request: { tabId: number }) => Promise<void>;
  removeHostAccessRequest?: (request: { tabId: number }) => Promise<void>;
  onAdded: ChromeEvent<(permissions: { origins?: string[] }) => void>;
}

interface TabsApi {
  onActivated: ChromeEvent<(info: { tabId: number }) => void>;
  onRemoved: ChromeEvent<(tabId: number, ...rest: any[]) => void>;
  onUpdated: ChromeEvent<(tabId: number, info: { status?: string }, ...rest: any[]) => void>;
}

export interface HostAccessCoordinator {
  request(tabId: number): Promise<HostAccessRequestStatus>;
  subscribe(listener: (event: HostAccessEvent) => void): () => void;
  dispose(): void;
}

export function createHostAccessCoordinator(
  permissions: PermissionsApi,
  tabs: TabsApi,
): HostAccessCoordinator {
  let pending: { tabId: number; stale: boolean } | undefined;
  let disposed = false;
  const subscribers = new Set<(event: HostAccessEvent) => void>();

  const hasSupportedOrigin = (origins: string[] | undefined) => origins?.some((origin) => {
    const match = /^https:\/\/([^/]+)(?:\/|$)/i.exec(origin);
    const hostname = match?.[1]?.replace(/^\*\./, "").toLowerCase();
    if (!hostname) return false;
    return ["zhipin.com", "liepin.com", "zhaopin.com", "51job.com"]
      .some((host) => hostname === host || hostname.endsWith(`.${host}`));
  }) ?? false;

  const removeChromeRequest = async (tabId: number) => {
    if (!permissions.removeHostAccessRequest) return false;
    try {
      await permissions.removeHostAccessRequest({ tabId });
      return true;
    } catch {
      return false;
    }
  };

  const markStale = (tabId: number) => {
    if (pending?.tabId !== tabId || pending.stale) return;
    const current = pending;
    current.stale = true;
    void removeChromeRequest(current.tabId).then((removed) => {
      if (removed && pending === current) pending = undefined;
    });
  };
  const onActivated = ({ tabId }: { tabId: number }) => {
    if (pending && pending.tabId !== tabId) markStale(pending.tabId);
  };
  const onRemoved = (tabId: number) => markStale(tabId);
  const onUpdated = (tabId: number, info: { status?: string }) => {
    if (info.status === "loading") markStale(tabId);
  };
  const onAdded = (grant: { origins?: string[] }) => {
    if (!pending || !hasSupportedOrigin(grant.origins)) return;
    const current = pending;
    pending = undefined;
    const event: HostAccessEvent = current.stale
      ? { kind: "stale", tabId: current.tabId }
      : { kind: "granted", tabId: current.tabId };
    for (const subscriber of subscribers) subscriber(event);
  };

  permissions.onAdded.addListener(onAdded);
  tabs.onActivated.addListener(onActivated);
  tabs.onRemoved.addListener(onRemoved);
  tabs.onUpdated.addListener(onUpdated);

  return {
    async request(tabId) {
      if (disposed || !permissions.addHostAccessRequest) return "unavailable";

      if (pending) {
        const previous = pending;
        pending = undefined;
        previous.stale = true;
        await removeChromeRequest(previous.tabId);
      }
      if (disposed) return "unavailable";

      const current = { tabId, stale: false };
      pending = current;
      try {
        await permissions.addHostAccessRequest({ tabId });
        return "requested";
      } catch {
        if (pending === current) pending = undefined;
        return "unavailable";
      }
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const current = pending;
      pending = undefined;
      subscribers.clear();
      if (current && permissions.removeHostAccessRequest) {
        try {
          void permissions.removeHostAccessRequest({ tabId: current.tabId }).catch(() => undefined);
        } catch {
          // A best-effort cleanup must not prevent listener removal.
        }
      }
      permissions.onAdded.removeListener(onAdded);
      tabs.onActivated.removeListener(onActivated);
      tabs.onRemoved.removeListener(onRemoved);
      tabs.onUpdated.removeListener(onUpdated);
    },
  };
}
