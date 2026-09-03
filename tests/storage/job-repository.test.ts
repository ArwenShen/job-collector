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
    get: async (key: string) => key in memory ? { [key]: memory[key] } : {},
    set: async (value: Record<string, unknown>) => { Object.assign(memory, value); },
    snapshot: () => memory,
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

  it("moves an existing key to the requested position when restoring", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位一"));
    await repository.save(record("2", "岗位二"));
    await repository.save(record("3", "岗位三"));

    await repository.restore(record("2", "岗位二（恢复）"), 0);

    expect((await repository.list()).map(({ job_title }) => job_title)).toEqual([
      "岗位二（恢复）", "岗位一", "岗位三",
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
