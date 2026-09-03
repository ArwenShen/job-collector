import type { ExtractedJob, JobRecord } from "../shared/job-record";
import type { ExtractResult, RequiredField } from "../shared/result";

const OPTIONAL_FIELDS = [
  "company_name", "salary", "location", "experience", "education", "company_description",
] as const;

export function buildRecord(
  fields: ExtractedJob,
  collectorVersion: string,
  now = new Date(),
  diagnostics: string[] = [],
): ExtractResult {
  const missingRequiredFields: RequiredField[] = [];
  if (!fields.job_title.trim()) missingRequiredFields.push("job_title");
  if (!fields.job_description.trim()) missingRequiredFields.push("job_description");
  if (missingRequiredFields.length > 0) {
    return { record: null, missingRequiredFields, diagnostics };
  }

  const optional = Object.fromEntries(
    OPTIONAL_FIELDS.map((field) => [field, fields[field]?.trim() ?? ""]),
  ) as Record<(typeof OPTIONAL_FIELDS)[number], string>;

  const record: JobRecord = {
    schema_version: "1",
    source_site: fields.source_site,
    source_job_id: fields.source_job_id.trim(),
    source_url: fields.source_url.trim(),
    job_title: fields.job_title.trim(),
    company_name: optional.company_name,
    salary: optional.salary,
    note: "",
    location: optional.location,
    experience: optional.experience,
    education: optional.education,
    job_description: fields.job_description.trim(),
    company_description: optional.company_description,
    missing_fields: OPTIONAL_FIELDS.filter((field) => !optional[field]).join(","),
    collected_at: now.toISOString(),
    collector_version: collectorVersion,
  };

  return { record, missingRequiredFields: [], diagnostics };
}
