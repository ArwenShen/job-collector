import { describe, expect, it } from "vitest";
import { extract51Job } from "../../src/extractors/job51";
import { loadFixture } from "../helpers/fixtures";

const url = new URL("https://jobs.51job.com/shanghai/172813359.html");

describe("51job extractor", () => {
  it("reads JobPosting JSON-LD and DOM display salary", () => {
    const result = extract51Job(url, loadFixture("sample-前程无忧.html", url.href), "0.1.0");
    expect(result.record).toMatchObject({
      source_site: "51job",
      source_job_id: "172813359",
      job_title: "AI用户产品经理-TikTok旗下图文独立端",
      company_name: "抖音视界有限公司",
      salary: "3.5-5.5万",
      location: "上海",
      experience: "2年",
      education: "本科",
    });
    expect(result.record?.job_description).toContain("负责旗下的独立社区产品功能设计与持续优化");
    expect(result.record?.company_description).toContain("字节跳动成立于2012年3月");
  });

  it("falls back to the scoped current-job DOM when JobPosting JSON-LD is unavailable", () => {
    const document = loadFixture("sample-前程无忧.html", url.href);
    [...document.querySelectorAll('script[type="application/ld+json"]')].forEach((script) => script.remove());
    const result = extract51Job(url, document, "0.1.0");
    expect(result.record).toMatchObject({
      source_job_id: "172813359",
      job_title: "AI用户产品经理-TikTok旗下图文独立端",
      company_name: "抖音视界有限公司", salary: "3.5-5.5万",
      location: "上海", experience: "2年", education: "本科",
    });
    expect(result.record?.job_description).toContain("负责旗下的独立社区产品功能设计与持续优化");
  });
});
