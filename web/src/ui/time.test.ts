import { test, expect, describe } from "bun:test";
import { relativeTime } from "./time";

function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe("relativeTime", () => {
  test("just now for < 1 minute", () => {
    expect(relativeTime(ago(0))).toBe("just now");
    expect(relativeTime(ago(30))).toBe("just now");
    expect(relativeTime(ago(59))).toBe("just now");
  });

  test("X minutes ago", () => {
    expect(relativeTime(ago(60))).toBe("1 minute ago");
    expect(relativeTime(ago(120))).toBe("2 minutes ago");
    expect(relativeTime(ago(45 * 60))).toBe("45 minutes ago");
  });

  test("X hours ago", () => {
    expect(relativeTime(ago(3600))).toBe("1 hour ago");
    expect(relativeTime(ago(7200))).toBe("2 hours ago");
    expect(relativeTime(ago(23 * 3600))).toBe("23 hours ago");
  });

  test("X days ago", () => {
    expect(relativeTime(ago(86400))).toBe("1 day ago");
    expect(relativeTime(ago(3 * 86400))).toBe("3 days ago");
    expect(relativeTime(ago(6 * 86400))).toBe("6 days ago");
  });

  test("X weeks ago", () => {
    expect(relativeTime(ago(7 * 86400))).toBe("1 week ago");
    expect(relativeTime(ago(14 * 86400))).toBe("2 weeks ago");
    expect(relativeTime(ago(28 * 86400))).toBe("4 weeks ago");
  });

  test("X months ago", () => {
    expect(relativeTime(ago(60 * 86400))).toBe("2 months ago");
    expect(relativeTime(ago(90 * 86400))).toBe("3 months ago");
  });
});
