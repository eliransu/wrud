import { describe, expect, it } from "vitest";
import { estimateCostUsd, formatApproxUsd, priceForModel } from "./pricing.js";

describe("priceForModel", () => {
  it("matches current Anthropic ids incl. dated + Bedrock forms", () => {
    expect(priceForModel("claude-opus-4-8")).toEqual({
      inputPerMTok: 5,
      outputPerMTok: 25,
    });
    expect(priceForModel("claude-haiku-4-5-20251001")?.inputPerMTok).toBe(1);
    expect(
      priceForModel("us.anthropic.claude-sonnet-4-6-v1:0")?.outputPerMTok,
    ).toBe(15);
    expect(priceForModel("claude-fable-5")?.inputPerMTok).toBe(10);
  });

  it("keeps legacy Opus 4/4.1 at the old price, newer Opus at the current one", () => {
    expect(priceForModel("claude-opus-4-1-20250805")?.inputPerMTok).toBe(15);
    expect(priceForModel("claude-opus-4-20250514")?.inputPerMTok).toBe(15);
    expect(priceForModel("claude-opus-4-6")?.inputPerMTok).toBe(5);
  });

  it("returns undefined for unknown models", () => {
    expect(priceForModel("my-local-llm")).toBeUndefined();
  });
});

describe("estimateCostUsd", () => {
  it("sums per-model input+output at list price", () => {
    const usd = estimateCostUsd([
      {
        model: "claude-opus-4-8",
        inputTokens: 1_000_000,
        outputTokens: 100_000,
      },
      { model: "claude-haiku-4-5", inputTokens: 500_000, outputTokens: 0 },
    ]);
    expect(usd).toBeCloseTo(5 + 2.5 + 0.5, 6);
  });

  it("refuses partial estimates when a used model is unknown", () => {
    expect(
      estimateCostUsd([
        { model: "claude-opus-4-8", inputTokens: 10, outputTokens: 10 },
        { model: "mystery", inputTokens: 5, outputTokens: 5 },
      ]),
    ).toBeNull();
  });

  it("ignores zero-usage models and returns null when nothing was used", () => {
    expect(
      estimateCostUsd([{ model: "mystery", inputTokens: 0, outputTokens: 0 }]),
    ).toBeNull();
  });
});

describe("formatApproxUsd", () => {
  it("renders table-friendly strings", () => {
    expect(formatApproxUsd(null)).toBe("-");
    expect(formatApproxUsd(0.004)).toBe("~$0.004");
    expect(formatApproxUsd(2.47)).toBe("~$2.47");
    expect(formatApproxUsd(1234)).toBe("~$1,234");
  });
});
