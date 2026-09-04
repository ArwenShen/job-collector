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
  return compactCss.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
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
    const documentRoots = rule("html, body, #app");
    expect(documentRoots).toMatch(/min-width:\s*320px/);
    expect(documentRoots).toMatch(/min-height:\s*100vh/);
    expect(documentRoots).toMatch(/background:\s*var\(--canvas\)/);
    expect(rule("body")).toMatch(/margin:\s*0/);
    expect(rule("body")).toMatch(/min-width:\s*320px/);
    expect(rule(".panel-shell")).toMatch(/min-height:\s*100vh/);
    expect(rule(".panel-shell")).toMatch(/display:\s*grid/);
    expect(rule(".panel-shell")).toMatch(
      /grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto\s*;/,
    );
    expect(rule(".panel-shell")).toMatch(/gap:\s*12px/);
  });

  it("uses explicit five-row and feedback-expanded six-row layouts", () => {
    expect(rule(".panel-shell--with-feedback")).toMatch(
      /grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto\s*;/,
    );

    const baseRegions = [
      [".panel-header", 1],
      [".panel-collect", 2],
      [".count-card", 3],
      [".feedback-region", 4],
      [".job-list-scroll", 4],
      [".panel-footer", 5],
    ] as const;
    for (const [selector, row] of baseRegions) {
      expect(rule(selector), selector).toMatch(new RegExp(`grid-row:\\s*${row}(?:\\s*\\/\\s*${row + 1})?`));
    }

    expect(rule(".panel-shell--with-feedback .job-list-scroll")).toMatch(/grid-row:\s*5/);
    expect(rule(".panel-shell--with-feedback .panel-footer")).toMatch(/grid-row:\s*6/);
    expect(rule(".feedback-region")).toMatch(/display:\s*flex/);
    expect(rule(".feedback-region")).toMatch(/flex-direction:\s*column/);
    expect(rule(".feedback-region")).toMatch(/gap:\s*4px/);
    expect(rule("[hidden]")).toMatch(/display:\s*none/);
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
    expect(rule(".job-header")).toMatch(/min-height:\s*40px/);
    expect(rule(".job-row")).toMatch(/min-height:\s*54px/);
    expect(rule(".truncate")).toMatch(/overflow:\s*hidden/);
    expect(rule(".truncate")).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule(".truncate")).toMatch(/white-space:\s*nowrap/);
  });

  it("keeps row action focus rings visible without disabling text clipping", () => {
    expect(rule(".cell")).toMatch(/overflow:\s*hidden/);
    expect(rule(".truncate")).toMatch(/overflow:\s*hidden/);
    expect(rule(".job-row .cell:has(> button)")).toMatch(/overflow:\s*visible/);
  });

  it("positions compact tooltips and modal dialogs above the panel", () => {
    expect(rule("[data-tooltip-popover]")).toMatch(/position:\s*fixed/);
    expect(rule("[data-tooltip-popover]")).toMatch(
      /max-width:\s*min\(280px,\s*calc\(100vw\s*-\s*16px\)\)/,
    );
    expect(rule("[data-tooltip-popover]")).toMatch(/padding:\s*9px\s+11px/);
    expect(rule("[data-tooltip-popover]")).toMatch(/pointer-events:\s*none/);
    expect(rule("[hidden]")).toMatch(/display:\s*none/);
    expect(rule(".dialog-backdrop")).toMatch(/position:\s*fixed/);
    expect(rule(".dialog-backdrop")).toMatch(/inset:\s*0/);
    expect(rule(".dialog-backdrop")).toMatch(/background:\s*rgba\(22,\s*22,\s*92,\s*0\.(?:78|82)\)/);
    expect(rule(".dialog-card")).toMatch(/max-width:\s*320px/);
  });

  it("enlarges only the clear confirmation dialog typography", () => {
    expect(rule(":root")).toMatch(/font-size:\s*12px/);
    expect(rule("button, textarea")).toMatch(/font:\s*inherit/);
    expect(rule(".dialog-card h2")).toMatch(/font-size:\s*16px/);
    expect(rule(".dialog-card label")).not.toMatch(/font-size\s*:/);
    expect(rule(".dialog-card p")).not.toMatch(/font-size\s*:/);
    expect(rule(".dialog-actions button")).not.toMatch(/font-size:\s*14px/);
    expect(rule('.dialog-card[data-dialog="clear"] h2')).toMatch(/font-size:\s*18px/);
    expect(rule('.dialog-card[data-dialog="clear"] p')).toMatch(/font-size:\s*14px/);
    expect(rule('.dialog-card[data-dialog="clear"] .dialog-actions button')).toMatch(
      /font-size:\s*14px/,
    );
  });

  it("uses 14px text for footer and note dialog actions only", () => {
    const footerButtons = rule(".panel-footer button");
    expect(footerButtons).toMatch(/font-size:\s*14px/);
    expect(footerButtons).toMatch(/min-height:\s*36px/);

    expect(rule('.dialog-card[data-dialog="note"] .dialog-actions button')).toMatch(
      /font-size:\s*14px/,
    );
    expect(rule(".dialog-actions button")).not.toMatch(/font-size:/);
    expect(rule('.dialog-card[data-dialog="clear"] .dialog-actions button')).toMatch(
      /font-size:\s*14px/,
    );
  });

  it("uses 14px note field text without changing shared dialog typography", () => {
    const noteFields = rule(
      '.dialog-card[data-dialog="note"] label, .dialog-card[data-dialog="note"] textarea',
    );
    expect(noteFields).toMatch(/font-size:\s*14px/);

    expect(rule(".dialog-card label")).not.toMatch(/font-size\s*:/);
    expect(rule(".dialog-card textarea")).not.toMatch(/font-size\s*:/);
    expect(rule(".dialog-card h2")).toMatch(/font-size:\s*16px/);
    expect(rule('.dialog-card[data-dialog="clear"] h2')).toMatch(/font-size:\s*18px/);
    expect(rule('.dialog-card[data-dialog="clear"] p')).toMatch(/font-size:\s*14px/);
  });

  it("keeps the narrow delete column wide enough for its button", () => {
    const media = compactCss.match(/@media\s*\(max-width:\s*359px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";
    expect(media).toMatch(/--job-columns:[^;]*\s32px\s*;/);
    expect(media).toMatch(/padding:\s*12px/);
    expect(media).not.toMatch(/display:\s*none/);
    expect(rule('[data-action="delete"]')).toMatch(/width:\s*32px/);
  });

  it("does not introduce remote imagery or decorative motion and depth", () => {
    expect(compactCss.toLowerCase()).not.toMatch(
      /url\s*\(|linear-gradient\s*\(|radial-gradient\s*\(|transition\s*:|animation(?:-[\w-]+)?\s*:|box-shadow\s*:/,
    );
  });
});
