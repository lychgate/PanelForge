// S0.1 placeholder test — proves the Vitest runner executes.
// Real test cases arrive with S0.3+ (security harness) per the task register.
const { describe, it, expect } = await import("vitest");

describe("S0.1 baseline", () => {
  it("test runner executes", () => {
    expect(true).toBe(true);
  });
});
