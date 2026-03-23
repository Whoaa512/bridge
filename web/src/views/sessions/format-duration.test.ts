import { describe, expect, it } from "bun:test";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("shows milliseconds under 1s", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("shows one decimal second from 1s to <10s", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(3200)).toBe("3.2s");
    expect(formatDuration(9999)).toBe("10.0s");
  });

  it("shows whole seconds from 10s to <60s", () => {
    expect(formatDuration(10000)).toBe("10s");
    expect(formatDuration(23400)).toBe("23s");
    expect(formatDuration(59999)).toBe("60s");
  });

  it("shows minutes and seconds at 60s+", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(134000)).toBe("2m 14s");
    expect(formatDuration(3600000)).toBe("60m 0s");
  });
});
