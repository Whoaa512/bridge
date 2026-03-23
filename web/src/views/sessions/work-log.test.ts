import { describe, it, expect } from "bun:test";
import type { ToolCallInfo } from "../../store";
import { deriveWorkLog } from "./work-log";

function tc(id: string, name: string, result?: string, isError?: boolean): ToolCallInfo {
  return { id, name, args: "{}", result, isError };
}

describe("deriveWorkLog", () => {
  it("returns empty for empty input", () => {
    expect(deriveWorkLog([])).toEqual([]);
  });

  it("single tool → single group", () => {
    const groups = deriveWorkLog([tc("1", "read", "ok")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Read 1 file");
    expect(groups[0].key).toBe("read-1");
    expect(groups[0].allComplete).toBe(true);
    expect(groups[0].hasErrors).toBe(false);
  });

  it("consecutive same-category tools are grouped", () => {
    const groups = deriveWorkLog([
      tc("1", "read", "ok"),
      tc("2", "Read", "ok"),
      tc("3", "read", "ok"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Read 3 files");
    expect(groups[0].tools).toHaveLength(3);
  });

  it("mixed categories → separate groups", () => {
    const groups = deriveWorkLog([
      tc("1", "read", "ok"),
      tc("2", "bash", "ok"),
      tc("3", "edit", "ok"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe("Read 1 file");
    expect(groups[1].label).toBe("Ran 1 command");
    expect(groups[2].label).toBe("Edited 1 file");
  });

  it("non-consecutive same category → separate groups", () => {
    const groups = deriveWorkLog([
      tc("1", "read", "ok"),
      tc("2", "bash", "ok"),
      tc("3", "read", "ok"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].key).toBe("read-1");
    expect(groups[2].key).toBe("read-3");
  });

  it("allComplete is false when any tool has no result", () => {
    const groups = deriveWorkLog([tc("1", "bash", "ok"), tc("2", "bash")]);
    expect(groups[0].allComplete).toBe(false);
  });

  it("hasErrors is true when any tool has isError", () => {
    const groups = deriveWorkLog([tc("1", "bash", "fail", true), tc("2", "bash", "ok")]);
    expect(groups[0].hasErrors).toBe(true);
  });

  it("unknown tool names → other category", () => {
    const groups = deriveWorkLog([tc("1", "some_custom_tool", "ok")]);
    expect(groups[0].label).toBe("Used 1 tool");
    expect(groups[0].key).toBe("other-1");
  });

  it("edit and write share a category", () => {
    const groups = deriveWorkLog([
      tc("1", "edit", "ok"),
      tc("2", "write", "ok"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Edited 2 files");
  });

  it("search tools share a category", () => {
    const groups = deriveWorkLog([
      tc("1", "search", "ok"),
      tc("2", "rg", "ok"),
      tc("3", "fd", "ok"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Searched 3 times");
  });

  it("question and questionnaire share a category", () => {
    const groups = deriveWorkLog([
      tc("1", "question", "ok"),
      tc("2", "questionnaire", "ok"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Asked 2 questions");
  });

  it("subagent gets correct labels", () => {
    const groups = deriveWorkLog([tc("1", "subagent", "ok"), tc("2", "subagent", "ok")]);
    expect(groups[0].label).toBe("Spawned 2 agents");
  });

  it("todo always says Updated todos", () => {
    const groups = deriveWorkLog([tc("1", "todo", "ok"), tc("2", "todo", "ok")]);
    expect(groups[0].label).toBe("Updated todos");
  });
});
