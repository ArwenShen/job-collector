import { buildRecord } from "./build-record";
import { htmlToText, visibleText } from "./dom";
import { canonicalizeUrl, matchJobId } from "./url";
import type { ExtractResult } from "../shared/result";

interface ZhaopinState {
  jobDetail?: {
    detailedPosition?: Record<string, unknown>;
    detailedCompany?: Record<string, unknown>;
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readState(document: Document): ZhaopinState | null {
  const script = [...document.scripts]
    .map((element) => element.textContent ?? "")
    .find((value) => value.startsWith("__INITIAL_STATE__="));
  if (!script) return null;
  try {
    return JSON.parse(script.slice("__INITIAL_STATE__=".length).replace(/;\s*$/, "")) as ZhaopinState;
  } catch {
    return null;
  }
}

export function matchesZhaopin(url: URL): boolean {
  return /(^|\.)zhaopin\.com$/.test(url.hostname) && /\/(jobdetail|jobs)\//.test(url.pathname);
}

export function extractZhaopin(url: URL, document: Document, version: string): ExtractResult {
  const state = readState(document);
  const position = state?.jobDetail?.detailedPosition ?? {};
  const company = state?.jobDetail?.detailedCompany ?? {};
  const description = text(position.description) || text(position.jobDesc);
  const info = [...document.querySelectorAll(".summary-planes__info > li")]
    .map((element) => visibleText(element))
    .filter(Boolean);

  return buildRecord({
    source_site: "zhaopin",
    source_job_id: text(position.positionNumber) || text(position.number)
      || matchJobId(url, /\/(?:jobdetail|jobs)\/([^/.]+)\.htm$/),
    source_url: canonicalizeUrl(text(position.positionUrl) || url.href),
    job_title: text(position.positionName) || text(position.name)
      || visibleText(document.querySelector(".summary-planes__title")),
    company_name: text(company.companyName) || text(position.companyName)
      || visibleText(document.querySelector(".company-info__name")),
    salary: text(position.salary) || visibleText(document.querySelector(".summary-planes__salary")),
    location: text(position.positionWorkCity) || text(position.workCity)
      || visibleText(document.querySelector(".summary-planes__info .workCity-link")),
    experience: text(position.positionWorkingExp) || text(position.workingExp) || info[1] || "",
    education: text(position.education) || info[2] || "",
    job_description: htmlToText(description)
      || visibleText(document.querySelector(".describtion-card__detail-content")),
    company_description: text(company.companyDescription)
      || visibleText(document.querySelector(".company-info__intro")),
  }, version, new Date(), state ? [] : ["missing __INITIAL_STATE__"]);
}
