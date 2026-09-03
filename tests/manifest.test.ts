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
    expect(manifest).not.toHaveProperty("host_permissions");
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
