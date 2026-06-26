import { defineConfig } from "@playwright/test";

const API_PORT = 8790;
const PLATFORM_PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: [["list"]],
  // API tests use request.get("/...") against the API; UI tests use absolute platform URLs.
  use: { baseURL: `http://localhost:${API_PORT}` },
  webServer: [
    {
      command: `WRUD_PORT=${API_PORT} npx tsx e2e/seed-and-serve.ts`,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `VITE_WRUD_API=http://localhost:${API_PORT} npm -w @wrud/platform run dev`,
      url: `http://localhost:${PLATFORM_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
