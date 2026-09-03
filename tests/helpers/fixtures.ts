import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

export function loadFixture(name: string, url: string): Document {
  const html = readFileSync(resolve(process.cwd(), "docs/sample", name), "utf8");
  return new JSDOM(html, { url }).window.document;
}
