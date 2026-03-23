import { describe, test, expect } from "bun:test";
import { parseDiffStat } from "./diff-stats";

describe("parseDiffStat", () => {
  test("edit tool with oldText/newText returns correct additions/deletions", () => {
    const args = JSON.stringify({
      oldText: "line1\nline2\nline3\n",
      newText: "line1\nchanged\nline3\nextra\n",
    });
    const stat = parseDiffStat("edit", args);
    expect(stat).not.toBeNull();
    expect(stat!.additions).toBe(2);
    expect(stat!.deletions).toBe(1);
  });

  test("edit tool case insensitive", () => {
    const args = JSON.stringify({ oldText: "a\n", newText: "b\n" });
    expect(parseDiffStat("Edit", args)).not.toBeNull();
    expect(parseDiffStat("EDIT", args)).not.toBeNull();
  });

  test("write tool with content returns all additions", () => {
    const args = JSON.stringify({ content: "line1\nline2\nline3\n" });
    const stat = parseDiffStat("write", args);
    expect(stat).toEqual({ additions: 3, deletions: 0 });
  });

  test("write tool case insensitive", () => {
    const args = JSON.stringify({ content: "x\n" });
    expect(parseDiffStat("Write", args)).not.toBeNull();
  });

  test("non-edit/write tool returns null", () => {
    expect(parseDiffStat("bash", '{"command":"ls"}')).toBeNull();
    expect(parseDiffStat("read", '{"path":"foo"}')).toBeNull();
  });

  test("malformed JSON returns null", () => {
    expect(parseDiffStat("edit", "not json")).toBeNull();
    expect(parseDiffStat("write", "{bad")).toBeNull();
  });

  test("missing fields returns null", () => {
    expect(parseDiffStat("edit", '{"oldText":"a"}')).toBeNull();
    expect(parseDiffStat("write", '{"path":"a"}')).toBeNull();
  });

  test("empty strings return {0, 0}", () => {
    const args = JSON.stringify({ oldText: "", newText: "" });
    expect(parseDiffStat("edit", args)).toEqual({ additions: 0, deletions: 0 });
  });

  test("write with empty content", () => {
    expect(parseDiffStat("write", JSON.stringify({ content: "" }))).toEqual({
      additions: 0,
      deletions: 0,
    });
  });
});
