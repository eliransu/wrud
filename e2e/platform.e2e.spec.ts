/**
 * Browser e2e for the Ant Design platform (Phase 3). Drives the real UI against the live
 * API: connect with a key, see the seeded session + its insight, create an API key, and
 * view the generated lesson. The platform runs on :5173 (absolute URLs here; the request
 * fixture's baseURL points at the API).
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const PLATFORM = "http://localhost:5173";
const ADMIN_KEY = readFileSync(".tmp-e2e/key.txt", "utf8").trim();

async function connect(page: Page) {
  await page.goto(PLATFORM);
  await page.getByLabel("api-key").fill(ADMIN_KEY);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

test("connects with an API key and shows the overview with seeded data", async ({
  page,
}) => {
  await connect(page);
  // The seeded session is reflected in the dashboard's telemetry widgets.
  await expect(page.getByText("Sessions").first()).toBeVisible();
  await expect(page.getByText("Model output tokens")).toBeVisible(); // model usage chart card
});

test("lists the seeded session and shows its model-rightsizing insight", async ({
  page,
}) => {
  await connect(page);
  await page.getByRole("menuitem", { name: "Sessions" }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await page.getByRole("link", { name: /.../ }).first().click();
  await expect(
    page.getByText("High-tier model used for a small task"),
  ).toBeVisible();
});

test("creates an API key and shows the one-time secret", async ({ page }) => {
  await connect(page);
  await page.getByRole("menuitem", { name: "API Keys" }).click();
  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByLabel("Name").fill("e2e-created-key");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("This secret is shown only once.")).toBeVisible();
});

test("shows the generated lesson", async ({ page }) => {
  await connect(page);
  await page.getByRole("menuitem", { name: "Lessons" }).click();
  await expect(page.getByRole("heading", { name: "Lessons" })).toBeVisible();
  await expect(page.getByText(/lighter, cheaper model/i).first()).toBeVisible();
});
