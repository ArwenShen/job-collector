import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/sidepanel/styles.css"),
  "utf8",
);
const compactCss = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return compactCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("side panel style contract", () => {
  it("defines the approved violet theme and semantic status colors", () => {
    for (const color of [
      "#16165c", "#232269", "#403cd5", "#5350cc", "#4846c6",
      "#fff", "#d8d8e3", "#9494a9", "#59b4ff", "#ff8e88",
    ]) {
      expect(css.toLowerCase()).toContain(color);
    }
  });

  it("keeps the application full-height and reserves a minmax row for scrolling", () => {
    expect(rule("body")).toMatch(/margin:\s*0/);
    expect(rule("body")).toMatch(/min-width:\s*320px/);
    expect(rule(".panel-shell")).toMatch(/min-height:\s*100vh/);
    expect(rule(".panel-shell")).toMatch(/display:\s*grid/);
    expect(rule(".panel-shell")).toMatch(/grid-template-rows:[^;]*minmax\(0,\s*1fr\)/);
  });

  it("makes only the job-list region vertically scrollable", () => {
    expect(rule(".job-list-scroll")).toMatch(/min-height:\s*0/);
    expect(rule(".job-list-scroll")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".job-list-scroll")).toMatch(/overflow-x:\s*hidden/);
  });

  it("uses one shared seven-column grid for headers and rows", () => {
    const sharedGrid = rule(".job-header, .job-row");
    expect(sharedGrid).toMatch(/display:\s*grid/);
    expect(sharedGrid).toMatch(/grid-template-columns:\s*var\(--job-columns\)/);
    expect(rule(":root")).toMatch(/--job-columns:[^;]*;/);
  });

  it("keeps table headers visible and truncates long cell content", () => {
    expect(rule(".job-header")).toMatch(/position:\s*sticky/);
    expect(rule(".job-header")).toMatch(/top:\s*0/);
    expect(rule(".truncate")).toMatch(/overflow:\s*hidden/);
    expect(rule(".truncate")).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule(".truncate")).toMatch(/white-space:\s*nowrap/);
  });

  it("positions compact tooltips and modal dialogs above the panel", () => {
    expect(rule("[data-tooltip-popover]")).toMatch(/position:\s*fixed/);
    expect(rule("[data-tooltip-popover]")).toMatch(
      /max-width:\s*min\(280px,\s*calc\(100vw\s*-\s*16px\)\)/,
    );
    expect(rule("[hidden]")).toMatch(/display:\s*none/);
    expect(rule(".dialog-backdrop")).toMatch(/position:\s*fixed/);
    expect(rule(".dialog-backdrop")).toMatch(/inset:\s*0/);
    expect(rule(".dialog-card")).toMatch(/max-width:\s*320px/);
  });

  it("provides a denser layout without hiding columns below 360px", () => {
    const media = compactCss.match(/@media\s*\(max-width:\s*359px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";
    expect(media).toContain("--job-columns:");
    expect(media).toMatch(/padding:\s*12px/);
    expect(media).not.toMatch(/display:\s*none/);
  });

  it("does not introduce remote imagery or decorative motion and depth", () => {
    expect(compactCss.toLowerCase()).not.toMatch(
      /url\s*\(|linear-gradient\s*\(|radial-gradient\s*\(|transition\s*:|animation(?:-[\w-]+)?\s*:|box-shadow\s*:/,
    );
  });
});
