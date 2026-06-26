import { describe, it, expect } from "vitest";
import { AppError, errorBody } from "./errors.js";

describe("errors", () => {
  it("AppError carries status + code", () => {
    const e = new AppError(404, "not_found", "nope");
    expect(e.status).toBe(404);
    expect(errorBody(e)).toEqual({
      error: { code: "not_found", message: "nope", details: undefined },
    });
  });
});
