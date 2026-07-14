import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 180_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "npx next dev -p 3000",
    port: 3000,
    cwd: process.cwd(),
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
