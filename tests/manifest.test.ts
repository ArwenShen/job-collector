import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manifest", () => {
  it("uses Manifest V3 and only the approved permissions", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/public/manifest.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("background");
  });
});
