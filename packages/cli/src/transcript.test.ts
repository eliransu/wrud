import { describe, it, expect } from "vitest";
import {
  bufferToEvents,
  transcriptToUsage,
  usageDelta,
  usageTotals,
} from "./transcript.js";

const line = (model: string, input: number, output: number, calls = 1) => ({
  t: 1,
  kind: "model" as const,
  model,
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  calls,
});

describe("usageDelta", () => {
  it("first flush reports the full cumulative usage", () => {
    const d = usageDelta([line("opus", 100, 50)], {});
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      model: "opus",
      inputTokens: 100,
      outputTokens: 50,
      calls: 1,
    });
  });

  it("later flushes report only the remainder, empty deltas dropped", () => {
    const reported = usageTotals([line("opus", 100, 50)]);
    const d = usageDelta(
      [line("opus", 100, 50), line("haiku", 10, 2)],
      reported,
    );
    expect(d).toHaveLength(1); // opus unchanged -> dropped
    expect(d[0]).toMatchObject({
      model: "haiku",
      inputTokens: 10,
      outputTokens: 2,
    });
  });

  it("clamps negatives (rewritten transcript) instead of going below zero", () => {
    const reported = usageTotals([line("opus", 100, 50)]);
    const d = usageDelta([line("opus", 80, 60, 2)], reported);
    expect(d[0]).toMatchObject({ inputTokens: 0, outputTokens: 10, calls: 1 });
  });

  it("deltas summed over turns equal the final cumulative (no double count)", () => {
    const turn1 = [line("opus", 100, 50)];
    const turn2 = [line("opus", 250, 90, 2), line("haiku", 10, 2)];
    const buffered = [
      ...usageDelta(turn1, {}),
      ...usageDelta(turn2, usageTotals(turn1)),
    ];
    // finalize-style catch-up against the buffer finds nothing left to report
    expect(usageDelta(turn2, usageTotals(buffered))).toHaveLength(0);
    expect(usageTotals(buffered)).toEqual(usageTotals(turn2));
  });
});

describe("transcript -> deltas -> events round trip", () => {
  const rec = (id: string, model: string, input: number, output: number) =>
    JSON.stringify({
      message: {
        id,
        role: "assistant",
        model,
        usage: { input_tokens: input, output_tokens: output },
      },
    });

  it("per-turn deltas become model_use events that sum to the transcript totals", () => {
    const t1 = rec("m1", "opus", 100, 50);
    const t2 = [t1, rec("m2", "opus", 150, 40), rec("m3", "haiku", 10, 2)].join(
      "\n",
    );
    const d1 = usageDelta(transcriptToUsage(t1), {});
    const d2 = usageDelta(transcriptToUsage(t2), usageTotals(d1));
    const events = bufferToEvents([...d1, ...d2]).filter(
      (e) => e.type === "model_use",
    );
    const totals = usageTotals(events.map((e) => e.payload as any));
    expect(totals.opus).toMatchObject({ input: 250, output: 90, calls: 2 });
    expect(totals.haiku).toMatchObject({ input: 10, output: 2, calls: 1 });
  });
});
