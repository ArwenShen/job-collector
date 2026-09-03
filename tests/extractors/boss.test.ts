import { describe, expect, it } from "vitest";
import { extractBoss } from "../../src/extractors/boss";
import { loadFixture } from "../helpers/fixtures";

const url = new URL("https://www.zhipin.com/job_detail/b50a084a830944370nJ53t6-FlRQ.html");

describe("BOSS extractor", () => {
  it("extracts the current job and excludes anti-copy and recommendation text", () => {
    const document = loadFixture("sample-BOSS直聘.html", url.href);
    const result = extractBoss(url, document, "0.1.0");
    const record = result.record;

    expect(result.missingRequiredFields).toEqual([]);
    expect(record).toMatchObject({
      source_site: "boss",
      source_job_id: "b50a084a830944370nJ53t6-FlRQ",
      job_title: "多模态大模型项目交付经理（2B / FDE）",
      company_name: "模思",
      salary: "40-70K·15薪",
      location: "上海",
      experience: "3-5年",
      education: "本科",
    });
    expect(record?.job_description).toContain("负责多模态大模型及 AI 全栈产品在企业客户侧的端到端交付");
    expect(record?.company_description).toContain("模思智能是一家人工智能初创企业");
    expect(record?.job_description).not.toMatch(/kanzhun|来自BOSS直聘|安全提示|base 北京 上海/);
    expect(record?.job_description).not.toContain("TikTok PMO（隐私安全合规方向）");
  });
});
