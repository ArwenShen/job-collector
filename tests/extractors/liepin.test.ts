import { describe, expect, it } from "vitest";
import { extractLiepin } from "../../src/extractors/liepin";
import { loadFixture } from "../helpers/fixtures";

const url = new URL("https://www.liepin.com/job/1984755411.shtml");

describe("Liepin extractor", () => {
  it("extracts only the current job and company", () => {
    const result = extractLiepin(url, loadFixture("sample-猎聘.html", url.href), "0.1.0");
    expect(result.record).toMatchObject({
      source_site: "liepin",
      source_job_id: "1984755411",
      job_title: "医疗AI产品经理",
      company_name: "商汤科技SenseTime",
      salary: "20-30k",
      location: "上海-徐汇区",
      experience: "5年以上",
      education: "本科",
    });
    expect(result.record?.job_description).toContain("一、岗位职责");
    expect(result.record?.job_description).toContain("二、任职要求");
    expect(result.record?.company_description).toContain("商汤科技以“坚持原创，让AI引领人类进步”为使命");
    expect(result.record?.job_description).not.toContain("猜你喜欢");
  });
});
