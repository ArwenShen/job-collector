import { describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "../../src/shared/job-record";
import { buildRecord } from "../../src/extractors/build-record";

describe("job record contract", () => {
  it("keeps the sample CSV's exact 16-column order", () => {
    expect(CSV_COLUMNS).toEqual([
      "schema_version", "source_site", "source_job_id", "source_url",
      "job_title", "company_name", "salary", "note", "location",
      "experience", "education", "job_description", "company_description",
      "missing_fields", "collected_at", "collector_version",
    ]);
  });

  it("blocks missing title and description", () => {
    const result = buildRecord({
      source_site: "boss",
      source_job_id: "abc",
      source_url: "https://www.zhipin.com/job_detail/abc.html",
      job_title: "",
      job_description: "",
    }, "0.1.0", new Date("2026-09-02T09:02:29.943Z"));

    expect(result.record).toBeNull();
    expect(result.missingRequiredFields).toEqual(["job_title", "job_description"]);
  });

  it("declares optional missing fields and leaves note empty", () => {
    const result = buildRecord({
      source_site: "boss",
      source_job_id: "abc",
      source_url: "https://www.zhipin.com/job_detail/abc.html",
      job_title: "AI产品经理",
      job_description: "负责产品设计。",
    }, "0.1.0", new Date("2026-09-02T09:02:29.943Z"));

    expect(result.record?.note).toBe("");
    expect(result.record?.missing_fields).toBe(
      "company_name,salary,location,experience,education,company_description",
    );
  });
});
