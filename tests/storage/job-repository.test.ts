import { describe, expect, it } from "vitest";
import { createJobRepository } from "../../src/storage/job-repository";
import type { JobRecord } from "../../src/shared/job-record";

const STORAGE_KEY = "jobCollector.records.v1";
const ORDER_KEY = "jobCollector.order.v1";

function record(id: string, title: string, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schema_version: "1", source_site: "boss", source_job_id: id,
    source_url: `https://www.zhipin.com/job_detail/${id}.html`, job_title: title,
    company_name: "公司", salary: "20-30K", note: "", location: "上海",
    experience: "3-5年", education: "本科", job_description: "完整JD",
    company_description: "公司介绍", missing_fields: "",
    collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
    ...overrides,
  };
}

function memoryArea(initial: Record<string, unknown> = {}) {
  const memory: Record<string, unknown> = { ...initial };
  return {
    get: async (keys: string | string[]) => Object.fromEntries(
      (Array.isArray(keys) ? keys : [keys])
        .filter((key) => key in memory)
        .map((key) => [key, memory[key]]),
    ),
    set: async (value: Record<string, unknown>) => { Object.assign(memory, value); },
    snapshot: () => memory,
  };
}

function serializedLock() {
  let tail = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      const result = tail.then(callback, callback);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

function pausableMemoryArea(initial: Record<string, unknown> = {}) {
  const area = memoryArea(initial);
  let releaseReads!: () => void;
  const readsReleased = new Promise<void>((resolve) => { releaseReads = resolve; });

  return {
    ...area,
    get: async (keys: string | string[]) => {
      const snapshot = await area.get(keys);
      await readsReleased;
      return snapshot;
    },
    releaseReads,
  };
}

describe("job repository", () => {
  it("updates a duplicate record without increasing count", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "旧标题"));
    await repository.save(record("1", "新标题"));

    expect(await repository.count()).toBe(1);
    expect((await repository.list())[0]?.job_title).toBe("新标题");
  });

  it("checks whether an identity exists", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位"));

    await expect(repository.has(
      { source_site: "boss", source_job_id: "1" },
    )).resolves.toBe(true);
    await expect(repository.has(
      { source_site: "boss", source_job_id: "missing" },
    )).resolves.toBe(false);
  });

  it("reads only records when counting and checking identities", async () => {
    const area = {
      get: async (keys: string | string[]) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        if (requested.includes(ORDER_KEY)) throw new Error("order unavailable");
        return { [STORAGE_KEY]: { "boss:1": record("1", "岗位") } };
      },
      set: async () => undefined,
    };
    const repository = createJobRepository(area);

    await expect(repository.count()).resolves.toBe(1);
    await expect(repository.has(
      { source_site: "boss", source_job_id: "1" },
    )).resolves.toBe(true);
  });

  it("serializes concurrent saves so neither record is lost", async () => {
    const area = pausableMemoryArea();
    const lock = serializedLock();
    const firstContext = createJobRepository(area, lock);
    const secondContext = createJobRepository(area, lock);

    const saves = Promise.all([
      firstContext.save(record("1", "岗位一")),
      secondContext.save(record("2", "岗位二")),
    ]);
    area.releaseReads();
    await saves;

    expect((await firstContext.list()).map(({ source_job_id }) => source_job_id)).toEqual(["1", "2"]);
  });

  it("serializes save and note update without losing either result", async () => {
    const area = pausableMemoryArea({
      [STORAGE_KEY]: { "boss:1": record("1", "岗位一") },
      [ORDER_KEY]: ["boss:1"],
    });
    const lock = serializedLock();
    const firstContext = createJobRepository(area, lock);
    const secondContext = createJobRepository(area, lock);

    const mutations = Promise.all([
      firstContext.save(record("2", "岗位二")),
      secondContext.updateNote({ source_site: "boss", source_job_id: "1" }, "新备注"),
    ]);
    area.releaseReads();
    await mutations;

    expect(await firstContext.list()).toEqual([
      record("1", "岗位一", { note: "新备注" }),
      record("2", "岗位二"),
    ]);
  });

  it("reads mutation state once and uses the fixed storage lock", async () => {
    const area = memoryArea();
    const getCalls: Array<string | string[]> = [];
    const lockNames: string[] = [];
    const trackingArea = {
      ...area,
      get: async (keys: string | string[]) => {
        getCalls.push(keys);
        return area.get(keys);
      },
    };
    const lock = {
      request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        lockNames.push(name);
        return callback();
      },
    };
    const repository = createJobRepository(trackingArea, lock);

    await repository.save(record("1", "岗位"));

    expect(getCalls).toEqual([[STORAGE_KEY, ORDER_KEY]]);
    expect(lockNames).toEqual(["jobCollector.storage.v1"]);
  });

  it("keeps first-collection order when a duplicate has a newer collected_at", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "第一个", { collected_at: "2026-09-02T09:00:00.000Z" }));
    await repository.save(record("2", "第二个", { collected_at: "2026-09-02T10:00:00.000Z" }));
    await repository.save(record("1", "第一个（刷新）", { collected_at: "2026-09-03T10:00:00.000Z" }));

    expect((await repository.list()).map(({ source_job_id }) => source_job_id)).toEqual(["1", "2"]);
  });

  it("preserves an existing note when refreshing a duplicate", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位", { note: "重点跟进" }));
    await repository.save(record("1", "岗位（刷新）", { note: "" }));

    expect((await repository.list())[0]?.note).toBe("重点跟进");
  });

  it("updates only the requested record note", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位一"));
    await repository.save(record("2", "岗位二", { note: "保留" }));

    await repository.updateNote({ source_site: "boss", source_job_id: "1" }, "已沟通");

    expect((await repository.list()).map(({ note }) => note)).toEqual(["已沟通", "保留"]);
  });

  it("fails to update the note of a missing record", async () => {
    const repository = createJobRepository(memoryArea());

    await expect(repository.updateNote(
      { source_site: "boss", source_job_id: "missing" }, "备注",
    )).rejects.toThrow("Job record not found");
  });

  it("removes and restores the complete record at its original position", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位一"));
    await repository.save(record("2", "岗位二", { note: "完整备注" }));
    await repository.save(record("3", "岗位三"));

    const removed = await repository.remove({ source_site: "boss", source_job_id: "2" });
    expect(removed).toEqual({ record: record("2", "岗位二", { note: "完整备注" }), index: 1 });
    expect((await repository.list()).map(({ source_job_id }) => source_job_id)).toEqual(["1", "3"]);

    await repository.restore(removed!.record, removed!.index);
    expect(await repository.list()).toEqual([
      record("1", "岗位一"), record("2", "岗位二", { note: "完整备注" }), record("3", "岗位三"),
    ]);
  });

  it("returns null when removing a missing record", async () => {
    const repository = createJobRepository(memoryArea());

    await expect(repository.remove(
      { source_site: "boss", source_job_id: "missing" },
    )).resolves.toBeNull();
  });

  it("clamps restore indexes to the available order boundaries", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("2", "岗位二"));

    await repository.restore(record("1", "岗位一"), -10);
    await repository.restore(record("3", "岗位三"), 99);

    expect((await repository.list()).map(({ source_job_id }) => source_job_id)).toEqual(["1", "2", "3"]);
  });

  it("reads legacy map order and initializes order on later mutation", async () => {
    const area = memoryArea({
      [STORAGE_KEY]: {
        "boss:2": record("2", "旧数据二", { collected_at: "2026-09-03T10:00:00.000Z" }),
        "boss:1": record("1", "旧数据一", { collected_at: "2026-09-02T10:00:00.000Z" }),
      },
    });
    const repository = createJobRepository(area);

    expect((await repository.list()).map(({ source_job_id }) => source_job_id)).toEqual(["2", "1"]);

    await repository.updateNote({ source_site: "boss", source_job_id: "1" }, "新备注");
    expect(area.snapshot()[ORDER_KEY]).toEqual(["boss:2", "boss:1"]);
  });

  it("filters invalid and duplicate order keys while retaining unordered records", async () => {
    const repository = createJobRepository(memoryArea({
      [STORAGE_KEY]: {
        "boss:1": record("1", "岗位一"),
        "boss:2": record("2", "岗位二"),
        "boss:3": record("3", "岗位三"),
      },
      [ORDER_KEY]: ["missing", "boss:2", "boss:2", "boss:1"],
    }));

    expect((await repository.list()).map(({ source_job_id }) => source_job_id)).toEqual(["2", "1", "3"]);
  });

  it("moves an existing key without replacing its current record", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位一"));
    await repository.save(record("2", "岗位二"));
    await repository.save(record("3", "岗位三"));

    await repository.restore(record("2", "岗位二（恢复）"), 0);

    expect((await repository.list()).map(({ job_title }) => job_title)).toEqual([
      "岗位二", "岗位一", "岗位三",
    ]);
  });

  it("moves a newly re-saved record without replacing it with the removed snapshot", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位一"));
    await repository.save(record("2", "旧岗位二", {
      collected_at: "2026-09-02T09:00:00.000Z",
      note: "旧备注",
    }));
    await repository.save(record("3", "岗位三"));
    const removed = await repository.remove({ source_site: "boss", source_job_id: "2" });

    await repository.save(record("2", "新岗位二", {
      collected_at: "2026-09-03T09:00:00.000Z",
      note: "最新备注",
    }));
    await repository.restore(removed!.record, removed!.index);

    expect(await repository.list()).toEqual([
      record("1", "岗位一"),
      record("2", "新岗位二", {
        collected_at: "2026-09-03T09:00:00.000Z",
        note: "最新备注",
      }),
      record("3", "岗位三"),
    ]);
  });

  it("clears both records and order", async () => {
    const area = memoryArea();
    const repository = createJobRepository(area);
    await repository.save(record("1", "岗位"));

    await repository.clear();

    expect(await repository.list()).toEqual([]);
    expect(await repository.count()).toBe(0);
    expect(area.snapshot()).toMatchObject({ [STORAGE_KEY]: {}, [ORDER_KEY]: [] });
  });
});
