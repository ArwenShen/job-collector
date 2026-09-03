const TRACKING_KEYS = /^(utm_|from$|from_|spm$|track|tracking|sid$|lid$)/i;

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  [...url.searchParams.keys()].forEach((key) => {
    if (TRACKING_KEYS.test(key)) url.searchParams.delete(key);
  });
  return url.toString();
}

export function matchJobId(url: URL, pattern: RegExp): string {
  return pattern.exec(url.pathname)?.[1] ?? "";
}
