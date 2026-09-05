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

  const markStale = (tabId: number) => {
    if (pending?.tabId === tabId) pending.stale = true;
  };
  const onActivated = ({ tabId }: { tabId: number }) => {
    if (pending && pending.tabId !== tabId) pending.stale = true;
  };
  const onRemoved = (tabId: number) => markStale(tabId);
  const onUpdated = (tabId: number, info: { status?: string }) => {
    if (info.status === "loading") markStale(tabId);
  };
  const onAdded = (grant: { origins?: string[] }) => {
    if (!pending || !grant.origins?.length) return;
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
      const current = { tabId, stale: false };
      pending = current;
      if (disposed || !permissions.addHostAccessRequest) {
        if (pending === current) pending = undefined;
        return "unavailable";
      }
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
      pending = undefined;
      subscribers.clear();
      permissions.onAdded.removeListener(onAdded);
      tabs.onActivated.removeListener(onActivated);
      tabs.onRemoved.removeListener(onRemoved);
      tabs.onUpdated.removeListener(onUpdated);
    },
  };
}
