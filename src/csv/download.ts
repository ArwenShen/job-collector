import type { JobRecord } from "../shared/job-record";
import { serializeCsv } from "./serialize";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function exportJobs(records: JobRecord[], now = new Date()): void {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const url = URL.createObjectURL(new Blob([serializeCsv(records)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `job-collector-${stamp}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
