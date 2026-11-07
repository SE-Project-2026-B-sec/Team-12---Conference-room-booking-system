import { describe, expect, it } from "vitest";

describe("CRBS-38 / [CD-2] Failing Test Demonstration (TC20 / NFR05)", () => {
  it("deliberately fails to verify that CI blocks pull request merge and prevents deployment", () => {
    // Deliberate failure assertion for TC20 / NFR05 CD verification:
    // Proves that an automated test regression fails the CI workflow and blocks merging into main.
    expect(true).toBe(false);
  });
});

