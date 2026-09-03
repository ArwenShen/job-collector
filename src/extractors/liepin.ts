import { buildRecord } from "./build-record";
import { visibleText } from "./dom";
import { canonicalizeUrl, matchJobId } from "./url";
import type { ExtractResult } from "../shared/result";

const JOB_PATTERN = /^\/job\/(\d+)\.shtml$/;

function properties(document: Document): string[] {
  return [...document.querySelectorAll(
    ".job-apply-container .job-properties > span:not(.split):not(.recruit-cnt):not(.update-time)",
  )].map((element) => visibleText(element)).filter(Boolean);
}

export function matchesLiepin(url: URL): boolean {
  return /(^|\.)liepin\.com$/.test(url.hostname) && JOB_PATTERN.test(url.pathname);
}

export function extractLiepin(url: URL, document: Document, version: string): ExtractResult {
  const attrs = properties(document);
  return buildRecord({
    source_site: "liepin",
    source_job_id: matchJobId(url, JOB_PATTERN),
    source_url: canonicalizeUrl(url.href),
    job_title: visibleText(document.querySelector(".job-apply-container .name.ellipsis-2")),
    company_name: visibleText(document.querySelector(".company-card .name.ellipsis-1")),
    salary: visibleText(document.querySelector(".job-apply-container .salary")),
    location: attrs[0] ?? "",
    experience: attrs.find((value) => value.includes("经验") || value.endsWith("年以上")) ?? "",
    education: attrs.find((value) => /本科|硕士|博士|大专|学历不限/.test(value)) ?? "",
    job_description: visibleText(document.querySelector('[data-selector="job-intro-content"]')),
    company_description: visibleText(document.querySelector(".company-intro-container .paragraph-box .inner")),
  }, version);
}
