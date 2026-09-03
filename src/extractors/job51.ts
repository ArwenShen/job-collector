import { buildRecord } from "./build-record";
import { htmlToText, visibleText } from "./dom";
import { canonicalizeUrl, matchJobId } from "./url";
import type { ExtractResult } from "../shared/result";

const JOB_PATTERN = /\/(\d+)\.html$/;

function readPosting(document: Document): Record<string, unknown> | null {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const value = JSON.parse(script.textContent ?? "") as Record<string, unknown>;
      if (value["@type"] === "JobPosting") return value;
    } catch {
      continue;
    }
  }
  return null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function matches51Job(url: URL): boolean {
  return /(^|\.)51job\.com$/.test(url.hostname) && JOB_PATTERN.test(url.pathname);
}

export function extract51Job(url: URL, document: Document, version: string): ExtractResult {
  const posting = readPosting(document) ?? {};
  const identifier = object(posting.identifier);
  const organization = object(posting.hiringOrganization);
  const location = object(posting.jobLocation);
  const address = object(location.address);
  const companySection = document.querySelector(".job-corp.tBorderTop_box");

  return buildRecord({
    source_site: "51job",
    source_job_id: text(identifier.value) || matchJobId(url, JOB_PATTERN),
    source_url: canonicalizeUrl(text(posting.url) || url.href),
    job_title: text(posting.title) || visibleText(document.querySelector(".cn h1")).replace(/\s*\(职位编号：.*$/, ""),
    company_name: text(organization.name) || visibleText(document.querySelector(".corp-card .at.p-l-0")),
    salary: visibleText(document.querySelector(".cn strong")),
    location: text(address.addressLocality) || visibleText(document.querySelector(".type_2")),
    experience: text(posting.experienceRequirements) || visibleText(document.querySelector(".type_3")),
    education: text(posting.educationRequirements) || visibleText(document.querySelector(".type_4")),
    job_description: htmlToText(text(posting.description))
      || visibleText(document.querySelector(".job_msg > div:first-child")),
    company_description: visibleText(companySection?.querySelector(".tmsg") ?? null),
  }, version);
}
