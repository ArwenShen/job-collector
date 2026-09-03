import type { JobRecord } from "./job-record";

export type RequiredField = "job_title" | "job_description";

export interface ExtractResult {
  record: JobRecord | null;
  missingRequiredFields: RequiredField[];
  diagnostics: string[];
}
