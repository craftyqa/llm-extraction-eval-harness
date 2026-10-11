import { describe, expect, it } from "vitest";
import { estimateTokens } from "./tokens.ts";

describe("estimateTokens", () => {
  it("counts a run of other ASCII at a third of a token, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(2);
  });

  it("counts each digit as a token", () => {
    expect(estimateTokens("1234567890")).toBe(10);
    expect(estimateTokens("Total 99")).toBe(2 + 2);
  });

  it("counts a separator between digits as a whole token (decision #54)", () => {
    // Measured on qwen2.5: digits and the spaces between them are one token each
    expect(estimateTokens("4021 7730")).toBe(8 + 1);
    expect(estimateTokens("1,234.50")).toBe(6 + 2);
    expect(estimateTokens("12\n34\n")).toBe(4 + 2);
  });

  it("counts non-ASCII characters by UTF-8 bytes and splits ASCII runs at them", () => {
    expect(estimateTokens("é")).toBe(2);
    expect(estimateTokens(String.fromCharCode(0x4e00))).toBe(3);
    expect(estimateTokens(String.fromCharCode(0x202f))).toBe(3);
    expect(estimateTokens("😀")).toBe(4);
    expect(estimateTokens("café au lait")).toBe(1 + 2 + 3);
  });
});
