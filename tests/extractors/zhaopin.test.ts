import { describe, expect, it } from "vitest";
import { extractZhaopin } from "../../src/extractors/zhaopin";
import { loadFixture } from "../helpers/fixtures";

const url = new URL("https://www.zhaopin.com/jobdetail/CC542783320J40931875715.htm");

describe("Zhaopin extractor", () => {
  it("prefers the embedded initial state", () => {
    const result = extractZhaopin(url, loadFixture("sample-智联招聘.html", url.href), "0.1.0");
    expect(result.record).toMatchObject({
      source_site: "zhaopin",
      source_job_id: "CC542783320J40931875715",
      job_title: "AI客服产品经理(J16563)",
      company_name: "中通快递",
      salary: "2-4万·13薪",
      location: "上海",
      experience: "5-10年",
      education: "本科",
    });
    expect(result.record?.job_description).toContain("制定AI客服产品的长期规划与迭代路线");
    expect(result.record?.company_description).toContain("中通快递创建于2002年5月8日");
  });

  it("falls back to the scoped current-job DOM when initial state is unavailable", () => {
    const document = loadFixture("sample-智联招聘.html", url.href);
    [...document.scripts]
      .find((script) => (script.textContent ?? "").startsWith("__INITIAL_STATE__="))
      ?.remove();
    const result = extractZhaopin(url, document, "0.1.0");
    expect(result.record).toMatchObject({
      source_job_id: "CC542783320J40931875715",
      job_title: "AI客服产品经理(J16563)", company_name: "中通快递",
      salary: "2-4万·13薪", location: "上海", experience: "5-10年", education: "本科",
    });
    expect(result.record?.job_description).toContain("制定AI客服产品的长期规划与迭代路线");
    expect(result.record?.company_description).toContain("中通快递创建于2002年5月8日");
  });
});
