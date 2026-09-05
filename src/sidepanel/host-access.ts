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
  type Pending = { tabId: number; stale: boolean; removal?: Promise<boolean> };
  let pending: Pending | undefined;
  let disposed = false;
  let latestRequestGeneration = 0;
  let cancellationBarrier: Promise<void> = Promise.resolve();
  let signalDisposed: (() => void) | undefined;
  const disposedSignal = new Promise<void>((resolve) => {
    signalDisposed = resolve;
  });
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

  const queueChromeRemoval = (tabId: number) => {
    const removal = cancellationBarrier.then(() => removeChromeRequest(tabId));
    cancellationBarrier = removal.then(() => undefined);
    return removal;
  };

  const waitForCancellationBarrier = () => Promise.race([
    cancellationBarrier,
    disposedSignal,
  ]);

  const markStale = (tabId: number) => {
    if (pending?.tabId !== tabId || pending.stale) return;
    const current = pending;
    current.stale = true;
    current.removal = queueChromeRemoval(current.tabId);
    void current.removal.then((removed) => {
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
      const generation = ++latestRequestGeneration;
      if (disposed) return "unavailable";

      if (pending) {
        const previous = pending;
        pending = undefined;
        previous.stale = true;
        previous.removal ??= queueChromeRemoval(previous.tabId);
      }
      await waitForCancellationBarrier();
      if (disposed || generation !== latestRequestGeneration) return "unavailable";

      const addHostAccessRequest = permissions.addHostAccessRequest;
      if (!addHostAccessRequest) return "unavailable";

      const current = { tabId, stale: false };
      pending = current;
      try {
        await addHostAccessRequest({ tabId });
        if (disposed
          || generation !== latestRequestGeneration
          || pending !== current
          || current.stale) {
          if (pending === current) pending = undefined;
          if (!pending || pending.tabId !== tabId) void removeChromeRequest(tabId);
          return "unavailable";
        }
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
      signalDisposed?.();
      const current = pending;
      pending = undefined;
      subscribers.clear();
      if (current) current.removal ??= queueChromeRemoval(current.tabId);
      permissions.onAdded.removeListener(onAdded);
      tabs.onActivated.removeListener(onActivated);
      tabs.onRemoved.removeListener(onRemoved);
      tabs.onUpdated.removeListener(onUpdated);
    },
  };
}
