import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://commons.openfinclaw.ai",
  output: "static",
  build: {
    format: "directory",
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark-default",
    },
  },
});
