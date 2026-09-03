import { buildRecord } from "./build-record";
import { ownVisibleText, visibleText } from "./dom";
import { canonicalizeUrl, matchJobId } from "./url";
import type { ExtractResult } from "../shared/result";

const JOB_PATTERN = /^\/job_detail\/([^/]+)\.html$/;

export function matchesBoss(url: URL): boolean {
  return /(^|\.)zhipin\.com$/.test(url.hostname) && JOB_PATTERN.test(url.pathname);
}

export function extractBoss(url: URL, document: Document, version: string): ExtractResult {
  const primary = document.querySelector(".job-primary");
  const companyOwnText = ownVisibleText(primary?.querySelector(".detail-op .info") ?? null);
  const companyLink = document.querySelector(".sider-company .company-info a[title]");
  const companyFallback = companyLink?.getAttribute("title")?.trim() || visibleText(companyLink);
  const descriptionSection = [...document.querySelectorAll(".job-detail > .job-detail-section")]
    .find((section) => visibleText(section.querySelector(".detail-content-header h3")) === "职位描述");

  return buildRecord({
    source_site: "boss",
    source_job_id: matchJobId(url, JOB_PATTERN),
    source_url: canonicalizeUrl(url.href),
    job_title: visibleText(primary?.querySelector(".info-primary h1") ?? null),
    company_name: companyOwnText || companyFallback,
    salary: visibleText(primary?.querySelector(".salary") ?? null),
    location: visibleText(primary?.querySelector(".text-city") ?? null),
    experience: visibleText(primary?.querySelector(".text-experiece") ?? null),
    education: visibleText(primary?.querySelector(".text-degree") ?? null),
    job_description: visibleText(descriptionSection?.querySelector(":scope > .job-sec-text") ?? null),
    company_description: visibleText(
      document.querySelector(".job-detail-company .company-info-box > .job-sec-text"),
    ),
  }, version);
}
