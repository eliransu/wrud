/**
 * Screenshot + demo-video capture against the seed-demo server (run seed-demo.ts and the
 * platform dev server first). Writes stills to .tmp-shots/ and a walkthrough webm to
 * .tmp-shots/video/. Convert to gif with ffmpeg (see docs in the repo scripts).
 * Run: node e2e/shoot-demo.mjs
 */
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const PLATFORM = "http://localhost:11191";
const API = "http://localhost:8790";
const KEY = readFileSync(".tmp-demo/key.txt", "utf8").trim();
mkdirSync(".tmp-shots", { recursive: true });

// Find the featured session (the hand-crafted Stripe one) for the detail shot.
const res = await fetch(`${API}/v1/sessions?limit=50`, {
  headers: { authorization: `Bearer ${KEY}` },
});
const sessions = (await res.json()).items ?? [];
const featured =
  sessions.find((s) => s.user?.id === "maya" && s.agent?.name === "claude-code") ??
  sessions[0];

const browser = await chromium.launch();

async function newPage(ctx) {
  const page = await ctx.newPage();
  await page.addInitScript(
    ([k]) => localStorage.setItem("wrud_key", k),
    [KEY],
  );
  return page;
}

/* ---------- stills (2x for crisp README/website embeds) ---------- */
const ctx = await browser.newContext({
  viewport: { width: 1320, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await newPage(ctx);

const SHOTS = [
  ["01-overview", "/"],
  ["02-sessions", "/sessions"],
  ["03-session-detail", `/sessions/${featured.id}`],
  ["04-reports", "/reports"],
  ["05-lessons", "/lessons"],
  ["06-keys", "/keys"],
];
for (const [name, path] of SHOTS) {
  await page.goto(`${PLATFORM}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200); // let count-up + rise animations settle
  await page.screenshot({ path: `.tmp-shots/${name}.png` });
  console.log("shot", name);
}
await ctx.close();

/* ---------- walkthrough video for the demo gif ---------- */
const vctx = await browser.newContext({
  viewport: { width: 1320, height: 900 },
  colorScheme: "dark",
  recordVideo: { dir: ".tmp-shots/video", size: { width: 1320, height: 900 } },
});
const vpage = await newPage(vctx);
const visit = async (path, ms) => {
  await vpage.goto(`${PLATFORM}${path}`, { waitUntil: "networkidle" });
  await vpage.waitForTimeout(ms);
};
await visit("/", 3500);
await vpage.mouse.wheel(0, 700);
await vpage.waitForTimeout(2000);
await visit("/sessions", 3000);
await visit(`/sessions/${featured.id}`, 3200);
await vpage.mouse.wheel(0, 800);
await vpage.waitForTimeout(2200);
await visit("/reports", 3000);
await visit("/lessons", 3500);
await vctx.close();
console.log("video recorded");
await browser.close();
