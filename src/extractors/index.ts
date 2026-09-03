import { extract51Job, matches51Job } from "./job51";
import { extractBoss, matchesBoss } from "./boss";
import { extractLiepin, matchesLiepin } from "./liepin";
import { extractZhaopin, matchesZhaopin } from "./zhaopin";
import type { SourceSite } from "../shared/job-record";
import type { ExtractResult } from "../shared/result";

export type PageResult =
  | { kind: "success"; extraction: ExtractResult }
  | { kind: "not-detail-page"; site: SourceSite }
  | { kind: "unsupported-site" };

const sites: Array<{
  site: SourceSite;
  host: RegExp;
  matches: (url: URL) => boolean;
  extract: (url: URL, document: Document, version: string) => ExtractResult;
}> = [
  { site: "boss", host: /(^|\.)zhipin\.com$/, matches: matchesBoss, extract: extractBoss },
  { site: "liepin", host: /(^|\.)liepin\.com$/, matches: matchesLiepin, extract: extractLiepin },
  { site: "zhaopin", host: /(^|\.)zhaopin\.com$/, matches: matchesZhaopin, extract: extractZhaopin },
  { site: "51job", host: /(^|\.)51job\.com$/, matches: matches51Job, extract: extract51Job },
];

export function extractCurrentPage(url: URL, document: Document, version: string): PageResult {
  const platform = sites.find(({ host }) => host.test(url.hostname));
  if (!platform) return { kind: "unsupported-site" };
  if (!platform.matches(url)) return { kind: "not-detail-page", site: platform.site };
  return { kind: "success", extraction: platform.extract(url, document, version) };
}
