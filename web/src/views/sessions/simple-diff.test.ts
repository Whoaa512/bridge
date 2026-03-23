import { describe, test, expect } from "bun:test";
import { computeDiff } from "./simple-diff";

describe("computeDiff", () => {
  test("identical texts produce all context lines", () => {
    const lines = computeDiff("a\nb\nc\n", "a\nb\nc\n");
    expect(lines.every((l) => l.type === "context")).toBe(true);
    expect(lines.length).toBe(3);
    expect(lines[0]).toEqual({
      type: "context",
      content: "a",
      oldNum: 1,
      newNum: 1,
    });
  });

  test("pure addition", () => {
    const lines = computeDiff("", "a\nb\n");
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.type === "add")).toBe(true);
    expect(lines[0].newNum).toBe(1);
    expect(lines[1].newNum).toBe(2);
    expect(lines[0].oldNum).toBeUndefined();
  });

  test("pure deletion", () => {
    const lines = computeDiff("a\nb\n", "");
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.type === "remove")).toBe(true);
    expect(lines[0].oldNum).toBe(1);
    expect(lines[0].newNum).toBeUndefined();
  });

  test("mixed changes have correct interleaving", () => {
    const lines = computeDiff("a\nb\nc\n", "a\nX\nc\n");
    const types = lines.map((l) => l.type);
    expect(types).toContain("context");
    expect(types).toContain("remove");
    expect(types).toContain("add");
  });

  test("empty inputs produce empty array", () => {
    expect(computeDiff("", "")).toEqual([]);
  });

  test("line numbers are correct for mixed diff", () => {
    const lines = computeDiff("keep\nold\n", "keep\nnew\n");
    const ctx = lines.find((l) => l.type === "context")!;
    expect(ctx.oldNum).toBe(1);
    expect(ctx.newNum).toBe(1);

    const rm = lines.find((l) => l.type === "remove")!;
    expect(rm.oldNum).toBe(2);

    const add = lines.find((l) => l.type === "add")!;
    expect(add.newNum).toBe(2);
  });
});
