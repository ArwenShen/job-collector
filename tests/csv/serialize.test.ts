import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, type JobRecord } from "../../src/shared/job-record";
import { serializeCsv } from "../../src/csv/serialize";

const sample: JobRecord = {
  schema_version: "1", source_site: "boss", source_job_id: "a-1",
  source_url: "https://www.zhipin.com/job_detail/a-1.html", job_title: "AI“产品”经理",
  company_name: "公司,上海", salary: "20-30K", note: "", location: "上海",
  experience: "3-5年", education: "本科", job_description: "职责：\n1、设计\n2、评估",
  company_description: "公司说\"创新\"", missing_fields: "",
  collected_at: "2026-09-02T09:02:29.943Z", collector_version: "0.1.0",
};

describe("CSV serialization", () => {
  it("writes BOM, CRLF, exact columns, quotes, and multiline cells", () => {
    const output = serializeCsv([sample]);
    expect([...new TextEncoder().encode(output.slice(0, 1))]).toEqual([239, 187, 191]);
    expect(output.replaceAll("\r\n", "")).not.toContain("\n");
    expect(output.split("\r\n", 1)[0]).toBe(`\uFEFF${CSV_COLUMNS.map((name) => `"${name}"`).join(",")}`);
    expect(output).toContain('"公司,上海"');
    expect(output).toContain('"公司说""创新"""');
    expect(output).toContain('"职责：\r\n1、设计\r\n2、评估"');
  });
});
