/**
 * Demo seeder + server for screenshots/marketing shots. Seeds a believable two-week
 * team history into a throwaway DB (.tmp-demo): 5 users, 4 agents (coding, support,
 * research - wrud records ALL agents), 6 projects, ~30 sessions with realistic
 * model/token/cost mixes, skills, MCP tools, errors, and hand-crafted lessons.
 * Run: WRUD_PORT=8790 npx tsx e2e/seed-demo.ts   (key printed + written to .tmp-demo/key.txt)
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { buildApp } from "../packages/server/src/app.js";
import { SqliteStorageAdapter } from "../packages/server/src/storage/sqlite.js";
import { MemoryRateLimiter } from "../packages/server/src/ratelimit/memory.js";
import { buildSummarizer } from "../packages/server/src/summarize/composite.js";
import { defaultAnalyzers } from "../packages/server/src/insights/index.js";
import {
  generateApiKey,
  hashApiKey,
} from "../packages/server/src/auth/keys.js";
import { newId, type Event, type Insight } from "@wrud/shared";

rmSync(".tmp-demo", { recursive: true, force: true });
mkdirSync(".tmp-demo", { recursive: true });

const storage = new SqliteStorageAdapter(".tmp-demo/wrud.db");
const summarizer = buildSummarizer({ analyzers: defaultAnalyzers() });

// Deterministic jitter so re-runs produce the same screenshots.
let seed = 42;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

/* ---------- API keys (Keys page needs a few realistic rows) ---------- */
const { fullKey, prefix } = generateApiKey("local");
const adminKeyId = newId();
const NOW = Date.now();
const daysAgoIso = (d: number, h = 10) =>
  new Date(NOW - d * 86400_000 - (24 - h) * 3600_000).toISOString();

await storage.createApiKey({
  id: adminKeyId,
  name: "admin-dashboard",
  prefix,
  hash: hashApiKey(fullKey),
  scopes: ["admin", "read", "ingest"],
  createdAt: daysAgoIso(21),
  lastUsedAt: new Date(NOW - 120_000).toISOString(),
  revokedAt: null,
});
for (const [name, scopes, created, revoked] of [
  ["ci-ingest", ["ingest"], 18, null],
  ["maya-laptop", ["ingest", "read"], 14, null],
  ["support-fleet", ["ingest"], 12, null],
  ["old-staging", ["ingest"], 30, 9],
] as const) {
  const k = generateApiKey("local");
  await storage.createApiKey({
    id: newId(),
    name,
    prefix: k.prefix,
    hash: hashApiKey(k.fullKey),
    scopes: [...scopes],
    createdAt: daysAgoIso(created),
    lastUsedAt: revoked ? daysAgoIso(revoked) : daysAgoIso(0, 9),
    revokedAt: revoked ? daysAgoIso(revoked) : null,
  });
}
writeFileSync(".tmp-demo/key.txt", fullKey);

/* ---------- cast ---------- */
const USERS = {
  maya: { id: "maya", email: "maya@acme.dev", name: "Maya Chen" },
  dan: { id: "dan", email: "dan@acme.dev", name: "Dan Alvarez" },
  priya: { id: "priya", email: "priya@acme.dev", name: "Priya Nair" },
  tom: { id: "tom", email: "tom@acme.dev", name: "Tom Becker" },
  sofia: { id: "sofia", email: "sofia@acme.dev", name: "Sofia Ricci" },
};
const AGENTS = {
  claudeCode: { name: "claude-code", version: "2.1.14" },
  cursor: { name: "cursor", version: "1.7.2" },
  support: { name: "support-triage", version: "0.4.0" },
  research: { name: "deep-research", version: "0.9.1" },
};
const PROJECTS = {
  checkout: "/home/maya/work/checkout-api",
  billing: "/home/dan/work/billing-service",
  mobile: "/home/priya/work/mobile-app",
  supportInbox: "/srv/agents/support-inbox",
  pipeline: "/home/tom/work/data-pipeline",
  growth: "/home/sofia/work/growth-site",
};

interface ModelUse {
  model: string;
  calls: number;
  in: number;
  out: number;
  cacheRead?: number;
  task?: string;
}
interface Spec {
  user: keyof typeof USERS;
  agent: keyof typeof AGENTS;
  cwd: string;
  daysAgo: number;
  hour: number;
  durationMin: number;
  status: "summarized" | "open" | "abandoned";
  topic: string;
  category: string;
  narrative: string;
  firstPrompt: string;
  models: ModelUse[];
  tools: Record<string, number>;
  skills?: string[];
  mcp?: string[];
  files?: Array<[string, "create" | "edit" | "delete"]>;
  errors?: string[];
  insights?: Insight[];
}

/* ---------- hand-crafted sessions (the featured ones) ---------- */
const SPECS: Spec[] = [
  {
    // The session-detail screenshot: multi-model, skills, MCP, an insight, real narrative.
    user: "maya",
    agent: "claudeCode",
    cwd: PROJECTS.checkout,
    daysAgo: 0,
    hour: 9,
    durationMin: 47,
    status: "summarized",
    topic: "stripe webhook migration",
    category: "debugging",
    narrative:
      "Migrated the Stripe webhook handler to the 2026-06 signing scheme and fixed the replay-protection bug that dropped retried events. Two failed migration attempts traced to the FK constraint on refunds.order_id - dropped it, backfilled 4,100 rows, re-added it. Shipped behind the payments-v2 flag with a rollback note in the PR.",
    firstPrompt:
      "/systematic-debugging the stripe webhook handler drops retried events since the signing scheme update - find the root cause and migrate us to the new scheme",
    models: [
      {
        model: "claude-fable-5",
        calls: 34,
        in: 3_214_500,
        out: 48_230,
        cacheRead: 2_890_000,
        task: "webhook migration + FK backfill",
      },
      {
        model: "claude-haiku-4-5",
        calls: 12,
        in: 84_100,
        out: 6_420,
        task: "lint + changelog pass",
      },
    ],
    tools: { Read: 22, Edit: 14, Bash: 18, Grep: 9, Write: 3 },
    skills: ["code-review", "verify"],
    mcp: ["mcp__linear__create_issue", "mcp__github__create_pr"],
    files: [
      ["src/webhooks/stripe.ts", "edit"],
      ["src/webhooks/verify.ts", "edit"],
      ["migrations/0142_drop_refund_fk.sql", "create"],
      ["migrations/0143_backfill_refunds.sql", "create"],
      ["CHANGELOG.md", "edit"],
    ],
    errors: [
      "migration 0142 failed: FK constraint refunds_order_id_fkey still referenced",
      "migration 0142 failed: cannot drop index used by active query",
    ],
    insights: [
      {
        type: "repeated_failure",
        severity: "warn",
        title: "Same migration failed twice before succeeding",
        detail:
          "Migration 0142 failed twice on the refunds FK before the drop-backfill-recreate order fixed it. Captured as a lesson so the next schema change doesn't rediscover it.",
        evidence: { errorCount: 2, migration: "0142_drop_refund_fk" },
      },
    ],
  },
  {
    user: "dan",
    agent: "cursor",
    cwd: PROJECTS.billing,
    daysAgo: 1,
    hour: 14,
    durationMin: 22,
    status: "summarized",
    topic: "invoice rounding fix",
    category: "debugging",
    narrative:
      "Fixed the cent-rounding drift on multi-currency invoices: totals were rounded per line item instead of per invoice. Added a regression test with the EUR/JPY fixtures from the bug report.",
    firstPrompt:
      "invoice totals drift by a cent on multi-currency invoices - see LIN-2841 for fixtures",
    models: [
      {
        model: "claude-opus-4-8",
        calls: 19,
        in: 812_000,
        out: 21_188,
        cacheRead: 640_000,
        task: "rounding fix + regression tests",
      },
    ],
    tools: { Read: 11, Edit: 6, Bash: 8, Grep: 4 },
    mcp: ["mcp__linear__get_issue"],
    files: [
      ["src/invoices/totals.ts", "edit"],
      ["src/invoices/totals.test.ts", "edit"],
    ],
  },
  {
    user: "priya",
    agent: "claudeCode",
    cwd: PROJECTS.mobile,
    daysAgo: 1,
    hour: 11,
    durationMin: 63,
    status: "summarized",
    topic: "offline sync queue",
    category: "feature",
    narrative:
      "Built the offline mutation queue for the mobile app: writes land in SQLite while offline and replay in order on reconnect, with conflict resolution deferring to server timestamps. Covered the reconnect race with an integration test.",
    firstPrompt:
      "/product-brief implement the offline sync queue we specced - sqlite journal, replay on reconnect, server-wins conflicts",
    models: [
      {
        model: "claude-fable-5",
        calls: 41,
        in: 2_640_000,
        out: 61_400,
        cacheRead: 2_210_000,
        task: "offline queue implementation",
      },
      {
        model: "claude-sonnet-4-6",
        calls: 9,
        in: 240_000,
        out: 12_800,
        task: "test scaffolding",
      },
    ],
    tools: { Read: 31, Edit: 24, Bash: 15, Write: 7, Grep: 12 },
    skills: ["test-driven-development"],
    mcp: ["mcp__github__create_pr"],
    files: [
      ["app/sync/queue.ts", "create"],
      ["app/sync/replay.ts", "create"],
      ["app/sync/queue.test.ts", "create"],
      ["app/db/schema.ts", "edit"],
    ],
  },
  {
    user: "tom",
    agent: "claudeCode",
    cwd: PROJECTS.pipeline,
    daysAgo: 2,
    hour: 16,
    durationMin: 35,
    status: "summarized",
    topic: "dbt model dedup",
    category: "data",
    narrative:
      "Deduplicated the orders staging model - the late-arriving-events merge double-counted ~0.3% of rows. Rewrote the incremental strategy to merge on (order_id, event_ts) and backfilled the last 30 days.",
    firstPrompt:
      "orders_staging double counts late events, revenue dashboard is off by ~0.3% - fix the incremental merge",
    models: [
      {
        model: "claude-sonnet-4-6",
        calls: 23,
        in: 980_000,
        out: 28_900,
        cacheRead: 720_000,
        task: "dbt incremental rewrite",
      },
    ],
    tools: { Read: 14, Edit: 9, Bash: 21, Grep: 6 },
    files: [
      ["models/staging/orders.sql", "edit"],
      ["models/staging/schema.yml", "edit"],
    ],
    errors: [
      "dbt run failed: merge predicate references missing column event_ts",
    ],
  },
  {
    user: "sofia",
    agent: "research",
    cwd: PROJECTS.growth,
    daysAgo: 2,
    hour: 10,
    durationMin: 58,
    status: "summarized",
    topic: "pricing page teardown",
    category: "research",
    narrative:
      "Compared pricing pages across 9 competitors: 7 anchor on a mid tier, 5 gate SSO behind enterprise. Produced a teardown doc with screenshots and a recommended 3-tier structure anchored on the team plan.",
    firstPrompt:
      "/deep-research tear down competitor pricing pages - anchoring, tier structure, what's gated behind enterprise",
    models: [
      {
        model: "claude-fable-5",
        calls: 27,
        in: 1_890_000,
        out: 74_200,
        cacheRead: 1_320_000,
        task: "competitive teardown synthesis",
      },
      {
        model: "gemini-3-flash",
        calls: 38,
        in: 410_000,
        out: 22_100,
        task: "page extraction",
      },
    ],
    tools: { WebSearch: 19, WebFetch: 31, Read: 6, Write: 4 },
    skills: ["deep-research"],
    files: [["docs/pricing-teardown.md", "create"]],
  },
  {
    user: "dan",
    agent: "support",
    cwd: PROJECTS.supportInbox,
    daysAgo: 0,
    hour: 8,
    durationMin: 240,
    status: "open",
    topic: "morning triage run",
    category: "ops",
    narrative: "",
    firstPrompt: "/triage run the morning support queue",
    models: [
      {
        model: "claude-haiku-4-5",
        calls: 96,
        in: 1_480_000,
        out: 38_600,
        cacheRead: 1_100_000,
        task: "ticket classification + drafts",
      },
    ],
    tools: { Read: 12 },
    mcp: [
      "mcp__zendesk__list_tickets",
      "mcp__zendesk__update_ticket",
      "mcp__slack__send_message",
    ],
  },
  {
    user: "maya",
    agent: "claudeCode",
    cwd: PROJECTS.checkout,
    daysAgo: 3,
    hour: 15,
    durationMin: 8,
    status: "summarized",
    topic: "env var typo",
    category: "ops",
    narrative:
      "Renamed STRIPE_WEBOOK_SECRET to STRIPE_WEBHOOK_SECRET across the deploy configs - a one-line fix plus the two places that read it.",
    firstPrompt: "the webhook secret env var is misspelled everywhere, fix it",
    models: [
      {
        model: "claude-opus-4-8",
        calls: 4,
        in: 96_000,
        out: 890,
        task: "env var rename",
      },
    ],
    tools: { Grep: 3, Edit: 3, Bash: 2 },
    files: [
      [".env.example", "edit"],
      ["deploy/prod.yaml", "edit"],
    ],
  },
];

/* ---------- filler sessions: believable volume across the two weeks ---------- */
const FILLER: Array<
  [keyof typeof USERS, keyof typeof AGENTS, string, string, string, string]
> = [
  [
    "maya",
    "claudeCode",
    PROJECTS.checkout,
    "idempotency keys",
    "feature",
    "Added idempotency keys to the charge endpoint; retries now return the original response instead of double-charging.",
  ],
  [
    "dan",
    "cursor",
    PROJECTS.billing,
    "tax id validation",
    "feature",
    "Added EU VAT and US EIN validation on the billing profile form with per-country format hints.",
  ],
  [
    "priya",
    "cursor",
    PROJECTS.mobile,
    "flaky snapshot tests",
    "debugging",
    "Pinned the device clock in snapshot tests - 14 flaky snapshots stabilized.",
  ],
  [
    "tom",
    "claudeCode",
    PROJECTS.pipeline,
    "airflow retry storm",
    "ops",
    "Capped exponential backoff on the ingest DAG; a bad upstream no longer triggers 400 retries overnight.",
  ],
  [
    "sofia",
    "claudeCode",
    PROJECTS.growth,
    "changelog page",
    "content",
    "Generated the June changelog page from merged PRs and edited it into release notes.",
  ],
  [
    "maya",
    "claudeCode",
    PROJECTS.checkout,
    "refund api docs",
    "content",
    "Wrote OpenAPI docs and examples for the new refunds endpoints.",
  ],
  [
    "dan",
    "claudeCode",
    PROJECTS.billing,
    "dunning email flow",
    "feature",
    "Implemented the 3-step dunning email sequence with per-locale templates.",
  ],
  [
    "priya",
    "claudeCode",
    PROJECTS.mobile,
    "deep link routing",
    "debugging",
    "Fixed cold-start deep links dropping the auth context on Android.",
  ],
  [
    "tom",
    "research",
    PROJECTS.pipeline,
    "warehouse cost audit",
    "research",
    "Audited warehouse spend: two unpartitioned scans account for 60% of query cost; filed fixes.",
  ],
  [
    "sofia",
    "research",
    PROJECTS.growth,
    "seo content gaps",
    "research",
    "Mapped 18 keyword gaps against competitor content; prioritized 6 briefs.",
  ],
  [
    "dan",
    "support",
    PROJECTS.supportInbox,
    "billing dispute batch",
    "ops",
    "Triaged 43 billing disputes; drafted refunds for 12, escalated 3 chargebacks.",
  ],
  [
    "maya",
    "cursor",
    PROJECTS.checkout,
    "checkout a11y pass",
    "refactor",
    "Keyboard-trap and label fixes across the checkout form; axe now passes clean.",
  ],
  [
    "priya",
    "claudeCode",
    PROJECTS.mobile,
    "push token refresh",
    "debugging",
    "Fixed silent push failures - expired FCM tokens now refresh on app foreground.",
  ],
  [
    "tom",
    "claudeCode",
    PROJECTS.pipeline,
    "schema drift alerts",
    "feature",
    "Added schema-drift detection on landing tables with Slack alerts.",
  ],
  [
    "sofia",
    "cursor",
    PROJECTS.growth,
    "hero copy variants",
    "content",
    "Drafted and shipped 3 hero copy variants behind the growth experiment flag.",
  ],
  [
    "dan",
    "claudeCode",
    PROJECTS.billing,
    "usage metering refactor",
    "refactor",
    "Extracted the metering aggregation into a worker; invoice generation dropped from 40s to 6s.",
  ],
  [
    "maya",
    "claudeCode",
    PROJECTS.checkout,
    "3ds fallback",
    "feature",
    "Added the 3DS2-to-3DS1 fallback path for issuers that fail frictionless auth.",
  ],
  [
    "priya",
    "research",
    PROJECTS.mobile,
    "react native upgrade scan",
    "research",
    "Scanned the RN 0.82 breaking changes against our native modules; two need patches.",
  ],
  [
    "tom",
    "cursor",
    PROJECTS.pipeline,
    "backfill runner",
    "feature",
    "Built a chunked backfill runner with resume - no more 6-hour single-transaction backfills.",
  ],
  [
    "sofia",
    "support",
    PROJECTS.supportInbox,
    "docs feedback sweep",
    "ops",
    "Clustered 120 docs-feedback tickets into 8 themes; filed issues for the top 4.",
  ],
  [
    "maya",
    "claudeCode",
    PROJECTS.checkout,
    "webhook replay tool",
    "feature",
    "Small admin tool to replay failed webhook deliveries with the new signatures.",
  ],
  [
    "dan",
    "cursor",
    PROJECTS.billing,
    "proration edge cases",
    "debugging",
    "Fixed proration for same-day plan changes crossing a billing anchor.",
  ],
];

const MODELS_BY_AGENT: Record<keyof typeof AGENTS, ModelUse[][]> = {
  claudeCode: [
    [
      {
        model: "claude-fable-5",
        calls: 18,
        in: 1_400_000,
        out: 26_000,
        cacheRead: 1_150_000,
      },
    ],
    [
      {
        model: "claude-opus-4-8",
        calls: 14,
        in: 620_000,
        out: 18_500,
        cacheRead: 480_000,
      },
      { model: "claude-haiku-4-5", calls: 6, in: 52_000, out: 3_100 },
    ],
    [
      {
        model: "claude-sonnet-4-6",
        calls: 16,
        in: 730_000,
        out: 21_000,
        cacheRead: 540_000,
      },
    ],
  ],
  cursor: [
    [
      {
        model: "claude-sonnet-4-6",
        calls: 12,
        in: 410_000,
        out: 14_200,
        cacheRead: 300_000,
      },
    ],
    [{ model: "gpt-5.4-mini", calls: 20, in: 380_000, out: 16_800 }],
  ],
  support: [
    [
      {
        model: "claude-haiku-4-5",
        calls: 60,
        in: 900_000,
        out: 24_000,
        cacheRead: 700_000,
      },
    ],
  ],
  research: [
    [
      {
        model: "claude-fable-5",
        calls: 15,
        in: 1_100_000,
        out: 42_000,
        cacheRead: 800_000,
      },
      { model: "gemini-3-flash", calls: 22, in: 260_000, out: 13_500 },
    ],
  ],
};

const TOOLSETS: Record<keyof typeof AGENTS, Record<string, number>> = {
  claudeCode: { Read: 16, Edit: 9, Bash: 11, Grep: 7, Write: 2 },
  cursor: { Read: 10, Edit: 8, Bash: 5, Grep: 3 },
  support: { Read: 6 },
  research: { WebSearch: 12, WebFetch: 18, Read: 4, Write: 2 },
};

// Uneven day clusters so the "sessions over time" chart looks organic, not flat.
const FILLER_DAYS = [
  3, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 8, 8, 9, 10, 10, 11, 11, 12, 13,
];
for (let i = 0; i < FILLER.length; i++) {
  const [user, agent, cwd, topic, category, narrative] = FILLER[i];
  const daysAgo = FILLER_DAYS[i % FILLER_DAYS.length];
  SPECS.push({
    user,
    agent,
    cwd,
    daysAgo,
    hour: 9 + Math.floor(rnd() * 9),
    durationMin: 10 + Math.floor(rnd() * 70),
    status: i === FILLER.length - 1 ? "abandoned" : "summarized",
    topic,
    category,
    narrative,
    firstPrompt: narrative.slice(0, 80),
    models: pick(MODELS_BY_AGENT[agent]).map((m) => ({
      ...m,
      in: Math.round(m.in * (0.6 + rnd() * 0.9)),
      out: Math.round(m.out * (0.6 + rnd() * 0.9)),
      cacheRead: m.cacheRead
        ? Math.round(m.cacheRead * (0.6 + rnd() * 0.8))
        : undefined,
    })),
    tools: TOOLSETS[agent],
    skills:
      rnd() > 0.6
        ? [pick(["code-review", "test-driven-development", "verify"])]
        : undefined,
    mcp:
      agent === "support"
        ? ["mcp__zendesk__list_tickets", "mcp__slack__send_message"]
        : rnd() > 0.5
          ? [
              pick([
                "mcp__github__create_pr",
                "mcp__linear__create_issue",
                "mcp__slack__send_message",
              ]),
            ]
          : undefined,
    errors: rnd() > 0.75 ? ["command failed: npm test (exit 1)"] : undefined,
  });
}

/* ---------- materialize sessions ---------- */
const TOOL_INPUTS: Record<string, () => unknown> = {
  Read: () => ({
    file_path: pick([
      "src/index.ts",
      "src/api/routes.ts",
      "README.md",
      "package.json",
    ]),
  }),
  Edit: () => ({
    file_path: "src/api/routes.ts",
    old_string: "...",
    new_string: "...",
  }),
  Bash: () => ({
    command: pick([
      "npm test",
      "git diff --stat",
      "npm run typecheck",
      "git log --oneline -5",
    ]),
  }),
  Grep: () => ({ pattern: pick(["TODO", "webhook", "invoice", "retry"]) }),
  Write: () => ({ file_path: "docs/notes.md" }),
  WebSearch: () => ({ query: "competitor pricing tiers 2026" }),
  WebFetch: () => ({ url: "https://example.com/pricing" }),
};

let featuredSessionId = "";
for (const spec of SPECS) {
  const sessionId = newId();
  if (!featuredSessionId) featuredSessionId = sessionId;
  const startMs = NOW - spec.daysAgo * 86400_000 - (24 - spec.hour) * 3600_000;
  const endMs = startMs + spec.durationMin * 60_000;
  const startedAt = new Date(startMs).toISOString();
  const endedAt = spec.status === "open" ? null : new Date(endMs).toISOString();

  await storage.createSession({
    id: sessionId,
    apiKeyId: adminKeyId,
    user: USERS[spec.user],
    agent: AGENTS[spec.agent],
    runtime: { os: pick(["darwin", "linux"]), cwd: spec.cwd },
    metadata: {},
    status: "open",
    startedAt,
    endedAt,
    createdAt: startedAt,
  });

  // Build the event stream: first prompt, tools, skills, mcp, files, errors, model rollups.
  const events: Event[] = [];
  const total =
    Object.values(spec.tools).reduce((a, b) => a + b, 0) +
    (spec.skills?.length ?? 0) +
    (spec.mcp?.length ?? 0) +
    (spec.files?.length ?? 0) +
    (spec.errors?.length ?? 0) +
    spec.models.length +
    2;
  let seq = 0;
  const ts = () =>
    new Date(
      startMs + ((seq + 1) / (total + 1)) * (endMs - startMs),
    ).toISOString();
  const push = (type: Event["type"], payload: unknown) =>
    events.push({
      id: newId(),
      sessionId,
      seq: seq++,
      timestamp: ts(),
      type,
      payload,
    } as Event);

  push("message", {
    role: "user",
    chars: spec.firstPrompt.length,
    text: spec.firstPrompt,
  });
  for (const [name, count] of Object.entries(spec.tools))
    for (let i = 0; i < count; i++)
      push("tool_call", {
        name,
        ok: true,
        durationMs: 40 + Math.floor(rnd() * 900),
        input: TOOL_INPUTS[name]?.() ?? {},
        output: "ok",
      });
  for (const s of spec.skills ?? [])
    push("tool_call", {
      name: "Skill",
      ok: true,
      input: JSON.stringify({ skill: s }),
    });
  for (const m of spec.mcp ?? [])
    push("tool_call", { name: m, ok: true, input: {}, output: "ok" });
  for (const [path, op] of spec.files ?? []) push("file_change", { path, op });
  for (const msg of spec.errors ?? [])
    push("error", {
      message: msg,
      kind: msg.startsWith("migration")
        ? "MigrationError"
        : "ToolExecutionError",
    });
  for (const m of spec.models)
    push("model_use", {
      model: m.model,
      calls: m.calls,
      inputTokens: m.in,
      outputTokens: m.out,
      cacheReadTokens: m.cacheRead,
      task: m.task,
    });
  push("message", {
    role: "assistant",
    chars: 400,
    text: spec.narrative || "Working...",
  });

  await storage.appendEvents(sessionId, events);

  if (spec.status === "summarized") {
    const stored = (await storage.getEvents(sessionId, { limit: 1000 })).items;
    const base = await summarizer.summarize(
      (await storage.getSession(sessionId))!,
      stored,
    );
    await storage.saveSummary({
      ...base,
      narrative: spec.narrative,
      context: spec.firstPrompt,
      topic: spec.topic,
      category: spec.category,
      insights: [...base.insights, ...(spec.insights ?? [])],
    });
    await storage.setSessionStatus(sessionId, "summarized", endedAt!);
  } else if (spec.status === "abandoned") {
    await storage.setSessionStatus(sessionId, "abandoned", endedAt!);
  }
}

/* ---------- lessons: hand-crafted, varied scope, some recurring (seen xN) ---------- */
const LESSONS: Array<
  [
    scope: "session" | "user" | "org",
    source: string,
    guidance: string,
    times: number,
  ]
> = [
  [
    "org",
    "model_rightsizing",
    "Opus-class models handled one-line fixes in 6 sessions this week. Route diffs under ~50 lines to Haiku - same outcome at roughly 1/10 the price (~$38/mo saved at current volume).",
    6,
  ],
  [
    "org",
    "repeated_failure",
    "`npm test` keeps failing in sandboxed runs without `--runInBand`. Four sessions burned retries rediscovering this - add it to the project CLAUDE.md so agents stop relearning it.",
    4,
  ],
  [
    "user",
    "prompt_context",
    "dan's billing sessions re-read the full OpenAPI spec every run (~400k input tokens each). Point the agent at the split per-route specs - comparable sessions cut input cost by ~60%.",
    3,
  ],
  [
    "session",
    "high_error_rate",
    "The Stripe webhook migration failed twice on the refunds FK constraint. Order matters: drop the constraint, backfill, then re-add - captured from session evidence so the next schema change starts there.",
    1,
  ],
  [
    "org",
    "cache_hygiene",
    "Long research sessions re-fetch the same sources. Keeping the shared web-cache MCP enabled bills those reads at 0.1x input rate - it halved input spend on comparable teardown sessions.",
    2,
  ],
  [
    "user",
    "tool_batching",
    "support-triage posts to Slack once per ticket (30+ calls per run) and hit rate limits in 3 runs this week. Batch replies per thread - one call per conversation, not per message.",
    3,
  ],
  [
    "org",
    "skill_adoption",
    "Sessions that ran /code-review before merging caught issues 9 times out of 11. Sessions that skipped it averaged 2.3 follow-up fix sessions - make it the default last step.",
    2,
  ],
];
for (const [scope, source, guidance, times] of LESSONS)
  for (let i = 0; i < times; i++)
    await storage.saveLesson({
      id: newId(),
      sessionId: featuredSessionId,
      scope,
      guidance,
      source,
      createdAt: daysAgoIso(Math.floor(rnd() * 6), 9 + i),
    });

/* ---------- serve ---------- */
const app = buildApp({
  storage,
  summarizer,
  rateLimiter: new MemoryRateLimiter({ limit: 100000, windowMs: 60000 }),
  corsOrigins: ["http://localhost:11191"],
});
serve({ fetch: app.fetch, port: Number(process.env.WRUD_PORT ?? 8790) }, (i) =>
  console.log(`demo server on ${i.port} - key: ${fullKey}`),
);
