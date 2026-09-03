import { CSV_COLUMNS, type JobRecord } from "../shared/job-record";

function quote(value: string): string {
  return `"${value.replace(/\r?\n/g, "\r\n").replaceAll('"', '""')}"`;
}

export function serializeCsv(records: JobRecord[]): string {
  const rows = [
    CSV_COLUMNS.map(quote).join(","),
    ...records.map((record) => CSV_COLUMNS.map((column) => quote(record[column])).join(",")),
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
