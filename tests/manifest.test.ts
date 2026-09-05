import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manifest", () => {
  it("configures the native side panel with only the approved permissions", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/public/manifest.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.permissions).toEqual([
      "activeTab",
      "scripting",
      "storage",
      "sidePanel",
    ]);
    expect(manifest.optional_host_permissions).toEqual([
      "https://*.zhipin.com/*",
      "https://*.liepin.com/*",
      "https://*.zhaopin.com/*",
      "https://*.51job.com/*",
    ]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest.permissions).not.toContain("tabs");
    expect(JSON.stringify(manifest.optional_host_permissions)).not.toMatch(
      /<all_urls>|https:\/\/\*\/\*|http:\/\/\*\/\*/,
    );
    expect(manifest.action).toEqual({ default_title: "岗位收集器" });
    expect(manifest.side_panel).toEqual({
      default_path: "sidepanel/index.html",
    });
    expect(manifest.background).toEqual({
      service_worker: "background.js",
      type: "module",
    });
  });
});
