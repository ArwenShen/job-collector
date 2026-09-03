import { describe, expect, it } from "vitest";
import { htmlToText, ownVisibleText, visibleText } from "../../src/extractors/dom";
import { canonicalizeUrl } from "../../src/extractors/url";

describe("DOM normalization", () => {
  it("drops display-none, visibility-hidden, and zero-size anti-copy nodes", () => {
    document.head.innerHTML = `<style>
      .hidden { display:none }
      .invisible { visibility:hidden }
      .noise { width:.1px;height:.1px;overflow:hidden;visibility:hidden }
    </style>`;
    document.body.innerHTML = `<div id="target">职<span class="hidden">直聘</span>位<br>
      描<span class="invisible">来自BOSS直聘</span>述<span class="noise">kanzhun</span></div>`;

    expect(visibleText(document.querySelector("#target"))).toBe("职位\n描述");
  });

  it("returns only an element's own visible text", () => {
    document.body.innerHTML = `<div id="company">模思<a>查看所有职位</a><div>下载App</div></div>`;
    expect(ownVisibleText(document.querySelector("#company"))).toBe("模思");
  });

  it("converts description HTML into stable lines", () => {
    expect(htmlToText("<div>职责：</div><div>1、产品设计</div><p>2、效果评估</p>"))
      .toBe("职责：\n1、产品设计\n2、效果评估");
  });

  it("removes tracking parameters and hash", () => {
    expect(canonicalizeUrl("https://example.com/job/1?utm_source=x&jobId=1#top"))
      .toBe("https://example.com/job/1?jobId=1");
  });
});
