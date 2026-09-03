import { describe, expect, it } from "vitest";
import { extractCurrentPage } from "../../src/extractors";
import { loadFixture } from "../helpers/fixtures";

describe("extractor registry", () => {
  it("routes supported detail pages", () => {
    const url = new URL("https://www.zhipin.com/job_detail/b50a084a830944370nJ53t6-FlRQ.html");
    const result = extractCurrentPage(url, loadFixture("sample-BOSS直聘.html", url.href), "0.1.0");
    expect(result.kind).toBe("success");
  });

  it("distinguishes a supported site non-detail page", () => {
    const result = extractCurrentPage(new URL("https://www.zhipin.com/web/geek/recommend"), document, "0.1.0");
    expect(result).toEqual({ kind: "not-detail-page", site: "boss" });
  });

  it("rejects unsupported sites", () => {
    const result = extractCurrentPage(new URL("https://example.com/jobs/1"), document, "0.1.0");
    expect(result).toEqual({ kind: "unsupported-site" });
  });
});
