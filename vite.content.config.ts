import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: false,
  build: {
    outDir: "../dist",
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve(process.cwd(), "src/content/index.ts"),
      formats: ["iife"],
      name: "JobCollectorContent",
      fileName: () => "content.js",
    },
  },
});
