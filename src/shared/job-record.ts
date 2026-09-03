export type SourceSite = "boss" | "liepin" | "zhaopin" | "51job";

export const CSV_COLUMNS = [
  "schema_version", "source_site", "source_job_id", "source_url",
  "job_title", "company_name", "salary", "note", "location",
  "experience", "education", "job_description", "company_description",
  "missing_fields", "collected_at", "collector_version",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type JobRecord = Record<CsvColumn, string> & { source_site: SourceSite };

export type ExtractedJob = Pick<
  JobRecord,
  "source_site" | "source_job_id" | "source_url" | "job_title" | "job_description"
> & Partial<Pick<
  JobRecord,
  "company_name" | "salary" | "location" | "experience" | "education" | "company_description"
>>;
