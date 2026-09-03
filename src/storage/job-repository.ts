import type { JobRecord } from "../shared/job-record";

const STORAGE_KEY = "jobCollector.records.v1";
const ORDER_KEY = "jobCollector.order.v1";

export interface RemovedJob {
  record: JobRecord;
  index: number;
}

interface StorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function buildStorageKey(record: Pick<JobRecord, "source_site" | "source_job_id">): string {
  return `${record.source_site}:${record.source_job_id}`;
}

export function createJobRepository(area: StorageLike = chrome.storage.local) {
  async function readState(): Promise<{ records: Record<string, JobRecord>; order: string[] }> {
    const [recordsResult, orderResult] = await Promise.all([
      area.get(STORAGE_KEY),
      area.get(ORDER_KEY),
    ]);
    const records = {
      ...((recordsResult[STORAGE_KEY] as Record<string, JobRecord> | undefined) ?? {}),
    };
    const storedOrder = orderResult[ORDER_KEY];
    const requestedOrder = Array.isArray(storedOrder) ? storedOrder : [];
    const seen = new Set<string>();
    const order: string[] = [];

    for (const key of requestedOrder) {
      if (typeof key === "string" && key in records && !seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }

    for (const key of Object.keys(records)) {
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }

    return { records, order };
  }

  async function writeState(records: Record<string, JobRecord>, order: string[]): Promise<void> {
    await area.set({ [STORAGE_KEY]: records, [ORDER_KEY]: order });
  }

  return {
    async save(record: JobRecord): Promise<void> {
      const { records, order } = await readState();
      const key = buildStorageKey(record);
      const existing = records[key];

      records[key] = existing ? { ...record, note: existing.note } : record;
      if (!existing) order.push(key);

      await writeState(records, order);
    },
    async list(): Promise<JobRecord[]> {
      const { records, order } = await readState();
      return order.map((key) => records[key]!);
    },
    async count(): Promise<number> {
      return Object.keys((await readState()).records).length;
    },
    async has(record: Pick<JobRecord, "source_site" | "source_job_id">): Promise<boolean> {
      return buildStorageKey(record) in (await readState()).records;
    },
    async updateNote(
      identity: Pick<JobRecord, "source_site" | "source_job_id">,
      note: string,
    ): Promise<void> {
      const { records, order } = await readState();
      const key = buildStorageKey(identity);
      const existing = records[key];
      if (!existing) throw new Error("Job record not found");

      records[key] = { ...existing, note };
      await writeState(records, order);
    },
    async remove(
      identity: Pick<JobRecord, "source_site" | "source_job_id">,
    ): Promise<RemovedJob | null> {
      const { records, order } = await readState();
      const key = buildStorageKey(identity);
      const existing = records[key];
      if (!existing) return null;

      const index = order.indexOf(key);
      delete records[key];
      order.splice(index, 1);
      await writeState(records, order);
      return { record: existing, index };
    },
    async restore(record: JobRecord, index: number): Promise<void> {
      const { records, order } = await readState();
      const key = buildStorageKey(record);
      const existingIndex = order.indexOf(key);
      if (existingIndex >= 0) order.splice(existingIndex, 1);

      const insertionIndex = Number.isFinite(index)
        ? Math.min(Math.max(Math.trunc(index), 0), order.length)
        : index > 0 ? order.length : 0;
      records[key] = record;
      order.splice(insertionIndex, 0, key);
      await writeState(records, order);
    },
    async clear(): Promise<void> {
      await writeState({}, []);
    },
  };
}
