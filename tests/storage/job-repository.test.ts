import { describe, expect, it } from "vitest";
import { createJobRepository } from "../../src/storage/job-repository";
import type { JobRecord } from "../../src/shared/job-record";

function record(id: string, title: string): JobRecord {
  return {
    schema_version: "1", source_site: "boss", source_job_id: id,
    source_url: `https://www.zhipin.com/job_detail/${id}.html`, job_title: title,
    company_name: "公司", salary: "20-30K", note: "", location: "上海",
    experience: "3-5年", education: "本科", job_description: "完整JD",
    company_description: "公司介绍", missing_fields: "",
    collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
  };
}

function memoryArea() {
  const memory: Record<string, unknown> = {};
  return {
    get: async () => memory,
    set: async (value: Record<string, unknown>) => { Object.assign(memory, value); },
  };
}

describe("job repository", () => {
  it("replaces the same site and job id without increasing count", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "旧标题"));
    await repository.save(record("1", "新标题"));
    expect(await repository.list()).toHaveLength(1);
    expect((await repository.list())[0]?.job_title).toBe("新标题");
  });

  it("keeps records after listing for export and clears only explicitly", async () => {
    const repository = createJobRepository(memoryArea());
    await repository.save(record("1", "岗位"));
    await repository.list();
    expect(await repository.count()).toBe(1);
    await repository.clear();
    expect(await repository.count()).toBe(0);
  });
});
