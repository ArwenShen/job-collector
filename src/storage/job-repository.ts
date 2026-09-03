import type { JobRecord } from "../shared/job-record";

const STORAGE_KEY = "jobCollector.records.v1";

interface StorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function buildStorageKey(record: Pick<JobRecord, "source_site" | "source_job_id">): string {
  return `${record.source_site}:${record.source_job_id}`;
}

export function createJobRepository(area: StorageLike = chrome.storage.local) {
  async function readMap(): Promise<Record<string, JobRecord>> {
    const result = await area.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as Record<string, JobRecord> | undefined) ?? {};
  }

  return {
    async save(record: JobRecord): Promise<void> {
      const records = await readMap();
      records[buildStorageKey(record)] = record;
      await area.set({ [STORAGE_KEY]: records });
    },
    async list(): Promise<JobRecord[]> {
      return Object.values(await readMap()).sort((a, b) => a.collected_at.localeCompare(b.collected_at));
    },
    async count(): Promise<number> {
      return Object.keys(await readMap()).length;
    },
    async has(record: Pick<JobRecord, "source_site" | "source_job_id">): Promise<boolean> {
      return buildStorageKey(record) in await readMap();
    },
    async clear(): Promise<void> {
      await area.set({ [STORAGE_KEY]: {} });
    },
  };
}
